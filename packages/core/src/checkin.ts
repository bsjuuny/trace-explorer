import type { Place } from "@trace/schemas";
import { haversineMeters } from "./geo";

export type GeoFix = { lat: number; lng: number; accuracy: number; timestamp: number };
export type CheckInReason = "ok" | "no-fix" | "stale-fix" | "low-accuracy" | "too-far" | "no-coordinates";
export type CheckInResult = { ok: boolean; reason: CheckInReason; distanceMeters: number | null };

export const MAX_FIX_AGE_MS = 30_000;

/** 거리만으로 통과시키지 않고 정확도·측정 시각을 함께 판정한다. */
export function evaluateCheckIn(place: Place, fix: GeoFix | null, nowMs: number): CheckInResult {
  if (!fix) return { ok: false, reason: "no-fix", distanceMeters: null };
  const { lat, lng } = place.coordinates;
  if (lat === null || lng === null) return { ok: false, reason: "no-coordinates", distanceMeters: null };
  const nums = [fix.lat, fix.lng, fix.accuracy, fix.timestamp];
  if (nums.some((n) => !Number.isFinite(n)) || fix.accuracy < 0 || Math.abs(fix.lat) > 90 || Math.abs(fix.lng) > 180)
    return { ok: false, reason: "no-fix", distanceMeters: null };
  if (fix.timestamp > nowMs + 5_000 || nowMs - fix.timestamp > MAX_FIX_AGE_MS) return { ok: false, reason: "stale-fix", distanceMeters: null };
  const d = haversineMeters({ lat: fix.lat, lng: fix.lng }, { lat, lng });
  if (fix.accuracy > place.checkInPolicy.maxAccuracyMeters) return { ok: false, reason: "low-accuracy", distanceMeters: d };
  if (d > place.checkInPolicy.radiusMeters) return { ok: false, reason: "too-far", distanceMeters: d };
  return { ok: true, reason: "ok", distanceMeters: d };
}

export type GeoProvider = {
  getCurrentPosition(
    ok: (p: { coords: { latitude: number; longitude: number; accuracy: number }; timestamp: number }) => void,
    err: (e: { code: number }) => void,
    opts: { enableHighAccuracy: boolean; timeout: number; maximumAge: number },
  ): void;
};

export type AcquireResult =
  | { status: "ok"; fix: GeoFix; attempts: number }
  | { status: "denied" | "timeout" | "unavailable"; attempts: number };

/** 위치 획득. 거부는 재시도하지 않고, timeout·불가는 최대 시도 횟수까지 재시도한다. */
export async function acquireFix(
  geo: GeoProvider | undefined,
  opts: { timeoutMs: number; maxAttempts: number },
): Promise<AcquireResult> {
  if (!geo) return { status: "unavailable", attempts: 0 };
  let last: "timeout" | "unavailable" = "timeout";
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    const r = await new Promise<AcquireResult | "retry">((resolve) => {
      geo.getCurrentPosition(
        (p) =>
          resolve({
            status: "ok",
            attempts: attempt,
            fix: { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, timestamp: p.timestamp },
          }),
        (e) => {
          if (e.code === 1) return resolve({ status: "denied", attempts: attempt });
          last = e.code === 3 ? "timeout" : "unavailable";
          resolve("retry");
        },
        { enableHighAccuracy: true, timeout: opts.timeoutMs, maximumAge: 0 },
      );
    });
    if (r !== "retry") return r;
  }
  return { status: last, attempts: opts.maxAttempts };
}
