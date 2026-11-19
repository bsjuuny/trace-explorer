import { describe, expect, it } from "vitest";
import { demoBundle } from "@trace/data";
import type { MysteryRequest, Place } from "@trace/schemas";
import {
  acquireFix, applyCompletion, emptyProgress, evaluateAccess, evaluateCheckIn, generateMystery, JONGNO5GA_STATION,
  makeRng, toSeoul, type GeoProvider,
} from "./index";

const heritage = demoBundle.accessPolicies.find((p) => p.id === "heritage-jongmyo-style")!;
const lateNight = demoBundle.accessPolicies.find((p) => p.id === "late-night")!;

const q = (iso: string, extra: Partial<Parameters<typeof evaluateAccess>[1]> = {}) => ({
  arrivalIso: iso, maxAdmissionFeeKrw: 0, requireNoReservation: false, stayMinutes: 4, allowUnverified: true, ...extra,
});

describe("Asia/Seoul 시간 계산", () => {
  it("UTC 입력도 KST 요일·시각으로 변환한다", () => {
    const t = toSeoul("2026-11-17T15:30:00Z"); // KST 11-18 00:30 수요일
    expect(t.date).toBe("2026-11-18");
    expect(t.dow).toBe(3);
    expect(t.minutes).toBe(30);
  });
});

describe("접근 규칙(종묘형 경계)", () => {
  it("화요일은 정기 휴관", () => {
    const r = evaluateAccess(heritage, q("2026-11-17T10:00:00+09:00"));
    expect(r.eligibility).toBe("ineligible");
    expect(r.reasons).toContain("closed-day");
  });
  it("수요일은 무료 일반관람 가능", () => {
    const r = evaluateAccess(heritage, q("2026-11-18T10:00:00+09:00"));
    expect(r.eligibility).toBe("eligible");
    expect(r.feeKrw).toBe(0);
  });
  it("목요일은 시간제 해설관람이라 자유 방문 불가", () => {
    const r = evaluateAccess(heritage, q("2026-11-19T10:00:00+09:00"));
    expect(r.eligibility).toBe("ineligible");
    expect(r.reasons).toContain("guided-only");
  });
  it("일요일 요금은 무료 한도 초과, 한도를 올리면 가능", () => {
    const sun = "2026-11-22T10:00:00+09:00";
    expect(evaluateAccess(heritage, q(sun)).reasons).toContain("fee-exceeds-limit");
    expect(evaluateAccess(heritage, q(sun, { maxAdmissionFeeKrw: 1000 })).eligibility).toBe("eligible");
  });
  it("11월 일요일은 17:30 종료·입장 마감 60분 전: 16:40 도착은 마감 후", () => {
    const r = evaluateAccess(heritage, q("2026-11-22T16:40:00+09:00", { maxAdmissionFeeKrw: 1000 }));
    expect(r.eligibility).toBe("ineligible");
    expect(r.reasons).toContain("last-entry-passed");
  });
  it("시간표가 검증되지 않았으면 보수적으로 unknown", () => {
    const r = evaluateAccess(heritage, q("2026-11-18T10:00:00+09:00", { allowUnverified: false }));
    expect(r.eligibility).toBe("unknown");
  });
  it("자정을 넘기는 영업시간: 01:00 가능, 02:30 불가", () => {
    expect(evaluateAccess(lateNight, q("2026-11-19T01:00:00+09:00", { stayMinutes: 3 })).eligibility).toBe("eligible");
    expect(evaluateAccess(lateNight, q("2026-11-19T02:30:00+09:00", { stayMinutes: 3 })).eligibility).toBe("ineligible");
  });
});

const baseReq = (over: Partial<MysteryRequest> = {}): MysteryRequest => ({
  origin: JONGNO5GA_STATION, durationMinutes: 15, themeIds: null, maxAdmissionFeeKrw: 0,
  requireNoReservation: true, visitedPlaceIds: [], localDateTime: "2026-11-19T10:00:00+09:00", randomSeed: "s1", ...over,
});
const demoOpts = { allowDemo: true, nowIso: "2026-11-19T10:00:00+09:00" };

describe("미스터리 생성 엔진", () => {
  it("같은 seed·입력이면 같은 결과", () => {
    const a = generateMystery(baseReq(), demoBundle, demoOpts);
    const b = generateMystery(baseReq(), demoBundle, demoOpts);
    expect(a.status).toBe("ok");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it("후보 순서가 달라도 같은 결과(안정 정렬)", () => {
    const shuffled = { ...demoBundle, places: [...demoBundle.places].reverse() };
    const a = generateMystery(baseReq(), demoBundle, demoOpts);
    const b = generateMystery(baseReq(), shuffled, demoOpts);
    expect(a.status === "ok" && b.status === "ok" && a.place.id === b.place.id).toBe(true);
  });
  it("seed를 바꾸면 여러 장소가 선택될 수 있다(다양성)", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const r = generateMystery(baseReq({ randomSeed: `seed-${i}` }), demoBundle, demoOpts);
      if (r.status === "ok") ids.add(r.place.id);
    }
    expect(ids.size).toBeGreaterThan(1);
  });
  it("메타에 알고리즘·가중치·PRNG 버전이 기록된다", () => {
    const r = generateMystery(baseReq(), demoBundle, demoOpts);
    expect(r.meta.engineVersion).toBeTruthy();
    expect(r.meta.weightsVersion).toBeTruthy();
    expect(r.meta.rng).toContain("mulberry32");
  });
  it("15분 초과 후보와 경로 불명 후보는 제외", () => {
    const r = generateMystery(baseReq(), demoBundle, demoOpts);
    const byId = Object.fromEntries(r.candidates.map((c) => [c.placeId, c]));
    expect(byId["demo-heritage-005"]!.exclusions).toContain("exceeds-duration");
    expect(byId["demo-far-008"]!.exclusions).toContain("route-unknown");
  });
  it("예약 불필요 옵션이면 예약제 장소 제외", () => {
    const r = generateMystery(baseReq(), demoBundle, demoOpts);
    expect(r.candidates.find((c) => c.placeId === "demo-museum-007")!.exclusions).toContain("reservation-required");
  });
  it("야간에는 야외 미션을 제외", () => {
    const r = generateMystery(baseReq({ localDateTime: "2026-11-19T22:00:00+09:00" }), demoBundle, demoOpts);
    expect(r.candidates.find((c) => c.placeId === "demo-alley-006")!.exclusions).toContain("night-outdoor");
  });
  it("공개 모드(allowDemo=false)에서는 데모·미검증 장소를 선택하지 않는다", () => {
    const r = generateMystery(baseReq(), demoBundle, { allowDemo: false, nowIso: demoOpts.nowIso });
    expect(r.status).toBe("none");
    expect(r.candidates.every((c) => c.eligibility !== "eligible")).toBe(true);
  });
  it("콘텐츠 만료 시 공개 모드는 신규 탐험 차단", () => {
    const r = generateMystery(baseReq(), demoBundle, { allowDemo: false, nowIso: "2027-06-01T00:00:00+09:00" });
    expect(r.status).toBe("none");
    expect(r.meta.expired).toBe(true);
  });
  it("후보가 없으면 먼 장소를 고르지 않고 제안을 돌려준다", () => {
    const r = generateMystery(baseReq({ themeIds: ["heritage"] }), demoBundle, demoOpts);
    expect(r.status).toBe("none");
    if (r.status === "none") expect(r.suggestions.length).toBeGreaterThan(0);
  });
  it("PRNG는 seed마다 결정적", () => {
    expect(makeRng("a")()).toBe(makeRng("a")());
    expect(makeRng("a")()).not.toBe(makeRng("b")());
  });
});

const place: Place = { ...demoBundle.places[0]!, coordinates: { lat: 37.5712, lng: 126.9992 } };
const NOW = 1_000_000;

describe("체크인 판정", () => {
  const fix = (over: Partial<{ lat: number; lng: number; accuracy: number; timestamp: number }> = {}) => ({
    lat: 37.5712, lng: 126.9992, accuracy: 20, timestamp: NOW, ...over,
  });
  it("범위·정확도·시각이 모두 맞으면 성공", () => {
    expect(evaluateCheckIn(place, fix(), NOW).ok).toBe(true);
  });
  it("저정확도는 거리가 맞아도 실패", () => {
    expect(evaluateCheckIn(place, fix({ accuracy: 500 }), NOW).reason).toBe("low-accuracy");
  });
  it("멀면 실패, 오래된 측정값도 실패, 측정 없음도 실패", () => {
    expect(evaluateCheckIn(place, fix({ lat: 37.58 }), NOW).reason).toBe("too-far");
    expect(evaluateCheckIn(place, fix({ timestamp: NOW - 60_000 }), NOW).reason).toBe("stale-fix");
    expect(evaluateCheckIn(place, fix({ timestamp: NOW + 60_000 }), NOW).ok).toBe(false); // 미래 시각
    expect(evaluateCheckIn(place, fix({ accuracy: Number.NaN }), NOW).ok).toBe(false);
    expect(evaluateCheckIn(place, fix({ accuracy: -1 }), NOW).ok).toBe(false);
    expect(evaluateCheckIn(place, fix({ lat: Number.NaN }), NOW).ok).toBe(false);
    expect(evaluateCheckIn(place, null, NOW).reason).toBe("no-fix");
  });
});

describe("위치 획득", () => {
  const geoSeq = (codes: Array<number | "ok">): GeoProvider => {
    let i = 0;
    return {
      getCurrentPosition(ok, err) {
        const c = codes[Math.min(i++, codes.length - 1)]!;
        if (c === "ok") ok({ coords: { latitude: 37.5, longitude: 127, accuracy: 10 }, timestamp: 1 });
        else err({ code: c });
      },
    };
  };
  it("거부는 재시도하지 않는다", async () => {
    const r = await acquireFix(geoSeq([1]), { timeoutMs: 100, maxAttempts: 3 });
    expect(r).toEqual({ status: "denied", attempts: 1 });
  });
  it("timeout 후 재시도로 성공", async () => {
    const r = await acquireFix(geoSeq([3, "ok"]), { timeoutMs: 100, maxAttempts: 3 });
    expect(r.status).toBe("ok");
    expect(r.attempts).toBe(2);
  });
  it("계속 timeout이면 최대 횟수 후 실패, Geolocation 없으면 unavailable", async () => {
    expect((await acquireFix(geoSeq([3]), { timeoutMs: 100, maxAttempts: 2 })).status).toBe("timeout");
    expect((await acquireFix(undefined, { timeoutMs: 100, maxAttempts: 2 })).status).toBe("unavailable");
  });
});

describe("보상 멱등성", () => {
  const reward = demoBundle.rewards[0]!;
  const input = { missionId: "m1", placeId: "p1", startedAt: "t0", completedAt: "t1", method: "checked-in" as const, reward };
  it("같은 완료 이벤트를 두 번 처리해도 XP는 한 번", () => {
    const a = applyCompletion(emptyProgress(), input);
    const b = applyCompletion(a.state, input);
    expect(a.granted).toBe(100);
    expect(b.duplicate).toBe(true);
    expect(b.state.xp).toBe(100);
  });
  it("같은 장소 재방문은 once 정책이라 XP 없음", () => {
    const a = applyCompletion(emptyProgress(), input);
    const b = applyCompletion(a.state, { ...input, startedAt: "t9" });
    expect(b.granted).toBe(0);
    expect(Object.keys(b.state.dex)).toHaveLength(1);
  });
  it("현장 인증 없는 대체 완료는 XP 0, 도감에는 미인증으로 기록", () => {
    const a = applyCompletion(emptyProgress(), { ...input, method: "self-reported" });
    expect(a.granted).toBe(0);
    expect(a.state.dex["p1"]!.verified).toBe(false);
  });
  it("대체 완료 후 현장 인증하면 인증 상태로 승격", () => {
    const a = applyCompletion(emptyProgress(), { ...input, method: "self-reported" });
    const b = applyCompletion(a.state, { ...input, startedAt: "t2" });
    expect(b.state.dex["p1"]!.verified).toBe(true);
    expect(b.granted).toBe(input.reward.xp); // 승격 시 XP 지급
    expect(b.state.xp).toBe(input.reward.xp);
  });
  it("현장 인증 후 같은 장소 재방문은 once 정책으로 XP 없음", () => {
    const a = applyCompletion(emptyProgress(), input);
    const b = applyCompletion(a.state, { ...input, startedAt: "t3" });
    expect(b.granted).toBe(0);
  });
});

import { Exception, ContentBundle } from "@trace/schemas";
import { demoContent } from "@trace/data";
describe("날짜 스키마", () => {
  it("예외 기간은 실존 YYYY-MM-DD만 허용", () => {
    expect(Exception.safeParse({ from: "2026-11-19", to: "2026-11-20", kind: "closed" }).success).toBe(true);
    expect(Exception.safeParse({ from: "2026/11/19", to: "2026-11-20", kind: "closed" }).success).toBe(false);
    expect(Exception.safeParse({ from: "2027-02-30", to: "2027-03-01", kind: "closed" }).success).toBe(false);
  });
  it("번들 expiresAt이 파싱 불가면 거부", () => {
    expect(ContentBundle.safeParse({ ...demoContent, expiresAt: "never" }).success).toBe(false);
    expect(ContentBundle.safeParse(demoContent).success).toBe(true);
  });
});

import { restoreProgress } from "./restore";
describe("restoreProgress", () => {
  it("손상된 저장 상태는 버리거나 빈 상태로", () => {
    expect(restoreProgress(null)).toEqual({ xp: 0, dex: {}, completedKeys: [] });
    expect(restoreProgress({ xp: "999", dex: 5, completedKeys: "x" })).toEqual({ xp: 0, dex: {}, completedKeys: [] });
    const r = restoreProgress({ xp: 120.7, dex: { a: { placeId: "a", firstVisitedAt: "t", verified: true, badge: null }, b: { placeId: "zzz" } }, completedKeys: ["k", 3] });
    expect(r.xp).toBe(120);
    expect(Object.keys(r.dex)).toEqual(["a"]);
    expect(r.completedKeys).toEqual(["k"]);
  });
  it("__proto__ 키는 무시", () => {
    const raw = JSON.parse('{"xp":1,"dex":{"__proto__":{"placeId":"__proto__","firstVisitedAt":"t","verified":true}},"completedKeys":[]}');
    expect(Object.keys(restoreProgress(raw).dex)).toEqual([]);
  });
});

import { Place as PlaceSchema } from "@trace/schemas";
describe("장소 추가 힌트", () => {
  const base = demoBundle.places[0]!;
  it("선택 필드이며 120자를 넘기면 거부", () => {
    expect(PlaceSchema.safeParse(base).success).toBe(true);
    expect(PlaceSchema.safeParse({ ...base, extraHint: "문 앞 화분을 찾아보세요." }).success).toBe(true);
    expect(PlaceSchema.safeParse({ ...base, extraHint: "가".repeat(121) }).success).toBe(false);
    expect(PlaceSchema.safeParse({ ...base, extraHint: "   " }).success).toBe(false);
  });
  it("데모 장소는 모두 힌트가 있고 이름을 직접 말하지 않음", () => {
    for (const p of demoBundle.places) {
      expect(p.extraHint, p.id).toBeTruthy();
      expect(p.extraHint!.includes(p.name.replace("[데모] ", "")), p.id).toBe(false);
    }
  });
});
