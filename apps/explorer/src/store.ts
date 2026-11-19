import { create } from "zustand";
import {
  acquireFix, applyCompletion, emptyProgress, restoreProgress, evaluateCheckIn, generateMystery, haversineMeters, JONGNO5GA_STATION,
  type CheckInReason, type MysteryMeta, type ProgressState,
} from "@trace/core";
import type { ContentBundle, Mission, MissionCandidate, MysteryRequest, Place } from "@trace/schemas";
import { loadContent } from "./lib/content";
import { CONSENT_VERSION } from "./lib/legal";
import { kvDelete, kvGet, kvSet, kvSetMany, wipeAll } from "./lib/storage";

/** 이 거리보다 멀면 내 위치를 출발점으로 쓰지 않는다(시범 지역은 종로5가 도보권). */
const FAR_FROM_SERVICE_AREA_M = 3000;

export type Consent = {
  version: string;
  /** 약관·처리방침 확인 */
  termsAck: boolean;
  /** 선택: 위치 이용 동의. 기본 미선택 */
  locationConsent: boolean;
  at: string;
};

export type Session = {
  mission: Mission;
  place: Place;
  selected: MissionCandidate;
  meta: MysteryMeta;
  startedAt: string;
  cluesShown: number;
  extraHint: boolean;
  destRevealed: boolean;
  status: "active" | "completed" | "ended";
  completion?: { method: "checked-in" | "self-reported"; granted: number; duplicate: boolean };
};

export type Origin = { lat: number; lng: number; kind: "manual" | "gps" };
export type Options = { durationMinutes: 15 | 30 | 60; themeId: string | null; freeOnly: boolean; noReservation: boolean };

export type CheckInUi = { state: "idle" | "locating" | "failed"; reason?: CheckInReason | "denied" | "timeout" | "unavailable" };

type State = {
  ready: boolean;
  bundle: ContentBundle | null;
  contentError: string | null;
  rolledBack: boolean;
  consent: Consent | null;
  progress: ProgressState;
  session: Session | null;
  origin: Origin;
  options: Options;
  lastNone: string[] | null;
  checkIn: CheckInUi;
  gpsMessage: string | null;
  init: () => Promise<void>;
  acceptTerms: (locationConsent: boolean) => Promise<void>;
  setLocationConsent: (v: boolean) => Promise<void>;
  setOptions: (o: Partial<Options>) => void;
  useManualOrigin: () => void;
  useMyLocation: () => Promise<void>;
  startMystery: () => boolean;
  revealNextClue: () => void;
  revealExtraHint: () => void;
  endMission: () => void;
  tryCheckIn: () => Promise<boolean>;
  completeSelfReported: () => void;
  clearSession: () => void;
  wipeEverything: () => Promise<{ blocked: boolean }>;
};

/** QA용: #/?seed=abc&now=2026-11-19T10:00:00+09:00 로 시드·현재시각을 고정한다. */
/** 운영 빌드에서는 무시한다(개발 서버 또는 VITE_ENABLE_QA_PARAMS=true 빌드에서만 허용). */
const QA_ENABLED = import.meta.env.DEV || import.meta.env.VITE_ENABLE_QA_PARAMS === "true";
function qaParams(): { seed?: string; now?: string } {
  if (!QA_ENABLED) return {};
  const q = location.hash.split("?")[1] ?? "";
  const p = new URLSearchParams(q);
  return { seed: p.get("seed") ?? undefined, now: p.get("now") ?? undefined };
}

const persistSession = (s: Session | null) => void (s ? kvSet("session", s) : kvDelete("session"));

/** 저장된 세션의 장소·미션을 현재 번들의 같은 id 항목으로 교체한다. 형식이 틀리거나 id가 없으면 세션을 버린다. */
function rebuildSession(raw: Session | null | undefined, bundle: ContentBundle): Session | null {
  if (!raw || typeof raw !== "object") return null;
  const status = raw.status;
  if (status !== "active" && status !== "completed" && status !== "ended") return null;
  if (typeof raw.startedAt !== "string" || typeof raw.cluesShown !== "number" || !raw.mission || !raw.place) return null;
  const mission = bundle.missions.find((m) => m.id === raw.mission.id);
  const place = bundle.places.find((p) => p.id === raw.place.id);
  if (!mission || !place) return null;
  return { ...raw, mission, place };
}

export const useApp = create<State>((set, get) => ({
  ready: false,
  bundle: null,
  contentError: null,
  rolledBack: false,
  consent: null,
  progress: emptyProgress(),
  session: null,
  origin: { ...JONGNO5GA_STATION, kind: "manual" },
  options: { durationMinutes: 15, themeId: null, freeOnly: true, noReservation: true },
  lastNone: null,
  checkIn: { state: "idle" },
  gpsMessage: null,

  async init() {
    const [consent, progress, session] = await Promise.all([
      kvGet<Consent>("consent"), kvGet<ProgressState>("progress"), kvGet<Session>("session"),
    ]);
    // 문서 버전이 바뀌면 재고지: 저장된 동의 버전이 다르면 동의 화면으로 돌려보낸다.
    const validConsent = consent && consent.version === CONSENT_VERSION ? consent : null;
    // 저장소 값은 신뢰하지 않는다: 진행 상태는 형식 검증, 세션은 아래에서 번들 기준으로 재구성한다.
    set({ consent: validConsent, progress: restoreProgress(progress), session: null });
    try {
      const { bundle, rolledBack } = await loadContent();
      set({ bundle, rolledBack, session: rebuildSession(session, bundle) });
    } catch (e) {
      set({ contentError: e instanceof Error ? e.message : "콘텐츠를 불러오지 못했습니다" });
    }
    set({ ready: true });
  },

  async acceptTerms(locationConsent) {
    const consent: Consent = { version: CONSENT_VERSION, termsAck: true, locationConsent, at: new Date().toISOString() };
    set({ consent });
    await kvSet("consent", consent);
  },

  async setLocationConsent(v) {
    const c = get().consent;
    if (!c) return;
    const consent = { ...c, locationConsent: v, at: new Date().toISOString() };
    set({ consent });
    await kvSet("consent", consent);
    if (!v) set({ origin: { ...JONGNO5GA_STATION, kind: "manual" } });
  },

  setOptions(o) {
    set({ options: { ...get().options, ...o } });
  },

  useManualOrigin() {
    set({ origin: { ...JONGNO5GA_STATION, kind: "manual" }, gpsMessage: null });
  },

  async useMyLocation() {
    if (!get().consent?.locationConsent) {
      set({ gpsMessage: "위치 이용에 동의하지 않아 종로5가역을 출발점으로 사용합니다. 설정에서 동의할 수 있어요." });
      return;
    }
    set({ gpsMessage: "위치를 확인하는 중…" });
    const r = await acquireFix(navigator.geolocation, { timeoutMs: 8000, maxAttempts: 2 });
    if (r.status === "ok") {
      const away = haversineMeters({ lat: r.fix.lat, lng: r.fix.lng }, JONGNO5GA_STATION);
      // 서비스 지역(종로5가 생활권)에서 멀면 그 좌표로 탐험을 만들 수 없다. PC는 IP·Wi-Fi 기반이라 크게 틀리거나 VPN으로 해외로 잡힐 수 있다.
      if (away > FAR_FROM_SERVICE_AREA_M) {
        const km = away >= 10000 ? `${Math.round(away / 1000)}km` : `${(away / 1000).toFixed(1)}km`;
        set({
          origin: { ...JONGNO5GA_STATION, kind: "manual" },
          gpsMessage: `브라우저가 알려 준 위치가 종로5가에서 약 ${km} 떨어져 있어요(정확도 약 ${Math.round(r.fix.accuracy)}m). PC는 IP·Wi-Fi로 위치를 추정해 틀릴 수 있고 VPN을 쓰면 해외로 나올 수 있어요. 이 위치는 사용하지 않고 종로5가역에서 시작합니다.`,
        });
        return;
      }
      set({ origin: { lat: r.fix.lat, lng: r.fix.lng, kind: "gps" }, gpsMessage: `내 위치를 사용합니다(정확도 약 ${Math.round(r.fix.accuracy)}m).` });
    } else {
      const m = r.status === "denied" ? "위치 권한이 거부되어" : "위치를 확인하지 못해";
      set({ origin: { ...JONGNO5GA_STATION, kind: "manual" }, gpsMessage: `${m} 종로5가역을 출발점으로 사용합니다.` });
    }
  },

  startMystery() {
    const { bundle, origin, options, progress } = get();
    if (!bundle) return false;
    const qa = qaParams();
    const nowIso = qa.now ?? new Date().toISOString();
    const req: MysteryRequest = {
      origin: { lat: origin.lat, lng: origin.lng },
      durationMinutes: options.durationMinutes,
      themeIds: options.themeId ? [options.themeId] : null,
      maxAdmissionFeeKrw: options.freeOnly ? 0 : 20000,
      requireNoReservation: options.noReservation,
      visitedPlaceIds: Object.keys(progress.dex),
      localDateTime: nowIso,
      ...(qa.seed ? { randomSeed: qa.seed } : { randomSeed: `${nowIso}|${Math.random()}` }),
    };
    // 전부 데모인 번들일 때만 데모 모드. 실장소가 하나라도 섞이면 엄격한 공개 기준을 적용한다.
    const allowDemo = bundle.places.length > 0 && bundle.places.every((p) => p.publication.isDemo);
    const r = generateMystery(req, bundle, { allowDemo, nowIso });
    if (r.status === "none") {
      set({ lastNone: r.suggestions });
      return false;
    }
    const session: Session = {
      mission: r.mission, place: r.place, selected: r.selected, meta: r.meta,
      startedAt: new Date().toISOString(), cluesShown: 1, extraHint: false, destRevealed: false, status: "active",
    };
    set({ session, lastNone: null, checkIn: { state: "idle" } });
    persistSession(session);
    return true;
  },

  revealNextClue() {
    const s = get().session;
    if (!s || s.cluesShown >= 3) return;
    const next = { ...s, cluesShown: s.cluesShown + 1 };
    set({ session: next });
    persistSession(next);
  },

  revealExtraHint() {
    const s = get().session;
    if (!s) return;
    const next = { ...s, extraHint: true };
    set({ session: next });
    persistSession(next);
  },

  endMission() {
    const s = get().session;
    if (!s) return;
    const next = { ...s, status: "ended" as const, destRevealed: true };
    set({ session: next });
    persistSession(next);
  },

  async tryCheckIn() {
    const { session, bundle, consent } = get();
    if (!session || session.status !== "active" || !bundle || !consent?.locationConsent) return false;
    set({ checkIn: { state: "locating" } });
    const r = await acquireFix(navigator.geolocation, { timeoutMs: 8000, maxAttempts: 2 });
    if (r.status !== "ok") {
      set({ checkIn: { state: "failed", reason: r.status } });
      return false;
    }
    const res = evaluateCheckIn(session.place, r.fix, Date.now());
    if (!res.ok) {
      set({ checkIn: { state: "failed", reason: res.reason } });
      return false;
    }
    finish("checked-in");
    return true;
  },

  completeSelfReported() {
    finish("self-reported");
  },

  clearSession() {
    set({ session: null, checkIn: { state: "idle" } });
    persistSession(null);
  },

  async wipeEverything() {
    const r = await wipeAll();
    set({ consent: null, progress: emptyProgress(), session: null, checkIn: { state: "idle" } });
    return r;
  },
}));

function finish(method: "checked-in" | "self-reported") {
  const { session, bundle, progress } = useApp.getState();
  if (!session || session.status !== "active" || !bundle) return;
  // 참조가 사라졌으면 다른 보상으로 대체하지 않고 완료를 거부한다.
  const reward = bundle.rewards.find((r) => r.id === session.mission.rewardId);
  if (!reward) return;
  const out = applyCompletion(progress, {
    missionId: session.mission.id, placeId: session.place.id, startedAt: session.startedAt,
    completedAt: new Date().toISOString(), method, reward,
  });
  const next: Session = {
    ...session, status: "completed", destRevealed: true,
    completion: { method, granted: out.granted, duplicate: out.duplicate },
  };
  useApp.setState({ progress: out.state, session: next, checkIn: { state: "idle" } });
  // 진행도와 세션은 한 트랜잭션으로 저장해 XP와 완료 화면이 어긋나지 않게 한다.
  void kvSetMany({ progress: out.state, session: next });
}
