import type { AccessPolicy, ContentBundle, Mission, MissionCandidate, MysteryRequest, Place } from "@trace/schemas";
import { evaluateAccess } from "./access";
import { ENGINE_CONFIG, ENGINE_VERSION, SCORE_WEIGHTS_VERSION } from "./config";
import { haversineMeters, JONGNO5GA_STATION } from "./geo";
import { makeRng, RNG_ALGORITHM, weightedPick } from "./rng";
import { addMinutesIso, toSeoul } from "./time";

export type EngineOptions = {
  /** true면 데모/미검수 콘텐츠를 후보로 허용(명시적 데모 모드). */
  allowDemo: boolean;
  /** 콘텐츠 만료 판정 기준 시각 */
  nowIso: string;
};

export type RouteEstimate = {
  confidence: "verified" | "approximate" | "unknown";
  minutes: number | null;
};

export function estimateWalk(origin: { lat: number; lng: number }, place: Place): RouteEstimate {
  const { lat, lng } = place.coordinates;
  if (lat === null || lng === null) return { confidence: "unknown", minutes: null };
  const nearReference = haversineMeters(origin, JONGNO5GA_STATION) <= ENGINE_CONFIG.referenceOriginRadiusMeters;
  if (nearReference && place.walkEstimate && place.walkEstimate.confidence !== "unknown") {
    return { confidence: place.walkEstimate.confidence, minutes: place.walkEstimate.minutes };
  }
  const straight = haversineMeters(origin, { lat, lng });
  if (straight > ENGINE_CONFIG.approxMaxStraightMeters) return { confidence: "unknown", minutes: null };
  const minutes = (straight * ENGINE_CONFIG.approxDetourFactor) / ENGINE_CONFIG.walkMetersPerMinute;
  return { confidence: "approximate", minutes: Math.ceil(minutes) };
}

export type MysteryMeta = {
  engineVersion: string;
  weightsVersion: string;
  rng: string;
  seed: string;
  contentVersion: string;
  expired: boolean;
};

export type MysteryResult =
  | {
      status: "ok";
      mission: Mission;
      place: Place;
      selected: MissionCandidate;
      candidates: MissionCandidate[];
      meta: MysteryMeta;
    }
  | { status: "none"; candidates: MissionCandidate[]; suggestions: string[]; meta: MysteryMeta };

export function generateMystery(req: MysteryRequest, bundle: ContentBundle, opts: EngineOptions): MysteryResult {
  const seed = req.randomSeed ?? `${req.localDateTime}|${req.origin.lat.toFixed(4)},${req.origin.lng.toFixed(4)}`;
  const expired = Date.parse(opts.nowIso) > Date.parse(bundle.expiresAt);
  const meta: MysteryMeta = {
    engineVersion: ENGINE_VERSION,
    weightsVersion: SCORE_WEIGHTS_VERSION,
    rng: RNG_ALGORITHM,
    seed,
    contentVersion: bundle.contentVersion,
    expired,
  };

  const policies = new Map<string, AccessPolicy>(bundle.accessPolicies.map((p) => [p.id, p]));
  const themeIds = requestedThemeIds(req, bundle);
  const now = toSeoul(req.localDateTime);

  // 장소별 미션 목록(시간 조건만 적용). 테마·검수 조건은 usableMissions에서 후보 단위로 판정한다.
  const missionsByPlace = new Map<string, Mission[]>();
  for (const m of bundle.missions) {
    if (m.durationMinutes > req.durationMinutes) continue;
    const list = missionsByPlace.get(m.placeId) ?? [];
    list.push(m);
    missionsByPlace.set(m.placeId, list);
  }

  // 안정 정렬을 위해 id 순
  const places = [...bundle.places].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const candidates = places.map((place) => evaluatePlace(place, req, policies, missionsByPlace, themeIds, opts, now.minutes));

  if (expired && !opts.allowDemo) {
    return { status: "none", candidates, suggestions: ["content-expired"], meta };
  }
  const eligible = candidates.filter((c) => c.eligibility === "eligible");
  if (eligible.length === 0) {
    return { status: "none", candidates, suggestions: buildSuggestions(req, candidates), meta };
  }

  eligible.sort((a, b) => b.score - a.score || (a.placeId < b.placeId ? -1 : 1));
  const top = eligible.slice(0, ENGINE_CONFIG.topN);
  const rng = makeRng(seed);
  const pick = weightedPick(top, top.map((c) => c.score), rng) ?? top[0]!;
  const place = bundle.places.find((p) => p.id === pick.placeId)!;
  // 같은 장소에 쓸 수 있는 미션이 여럿이면 시드 난수로 고른다(같은 시드면 같은 결과).
  const usable = usableMissions(missionsByPlace.get(place.id) ?? [], themeIds, opts.allowDemo).missions;
  const mission = usable[Math.floor(rng() * usable.length)] ?? usable[0]!;
  return { status: "ok", mission, place, selected: pick, candidates, meta };
}

/** 후보로 허용하는 테마 id 집합. 항상 활성 테마만 포함하고, 요청한 테마가 있으면 그 교집합이다(비활성 테마 미션은 "전체"에서도 제외). */
function requestedThemeIds(req: MysteryRequest, bundle: ContentBundle): Set<string> {
  const ids = new Set<string>();
  const only = req.themeIds && req.themeIds.length > 0 ? req.themeIds : null;
  for (const t of bundle.themes) if (t.active && (!only || only.includes(t.id))) ids.add(t.id);
  return ids;
}

/** 후보 미션: 요청 테마와 일치(mission.themeId)하고, 공개 모드에서는 검수가 끝난 것만. 탈락 사유도 돌려준다. */
function usableMissions(list: Mission[], themeIds: Set<string>, allowDemo: boolean): { missions: Mission[]; reason: string | null } {
  if (list.length === 0) return { missions: [], reason: "no-mission" };
  const byTheme = list.filter((m) => themeIds.has(m.themeId));
  if (byTheme.length === 0) return { missions: [], reason: "theme-mismatch" };
  const reviewed = allowDemo ? byTheme : byTheme.filter((m) => m.reviewed && m.safetyReviewed && m.clues.every((c) => c.reviewed));
  if (reviewed.length === 0) return { missions: [], reason: "mission-not-reviewed" };
  // 배열 순서와 무관하게 같은 시드가 같은 결과를 내도록 id 순으로 고정한다.
  return { missions: [...reviewed].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)), reason: null };
}

function evaluatePlace(
  place: Place,
  req: MysteryRequest,
  policies: Map<string, AccessPolicy>,
  missions: Map<string, Mission[]>,
  themeIds: Set<string>,
  opts: EngineOptions,
  nowMinutes: number,
): MissionCandidate {
  const ex: string[] = [];
  const base = (eligibility: MissionCandidate["eligibility"], extra: Partial<MissionCandidate> = {}): MissionCandidate => ({
    placeId: place.id,
    eligibility,
    exclusions: ex,
    score: 0,
    routeEstimateConfidence: "unknown",
    estimatedTravelMinutes: null,
    estimatedTotalMinutes: null,
    ...extra,
  });

  const { lat, lng } = place.coordinates;
  if (lat === null || lng === null) {
    ex.push("no-coordinates");
    return base("ineligible");
  }
  if (!opts.allowDemo) {
    if (place.publication.status !== "published" || place.publication.isDemo) {
      ex.push("not-published");
      return base("ineligible");
    }
    if (place.freshness !== "verified") {
      ex.push(`freshness-${place.freshness}`);
      return base("unknown");
    }
  }
  if (place.source.expiresAt && Date.parse(place.source.expiresAt) < Date.parse(opts.nowIso)) {
    ex.push("source-expired");
    return base("unknown");
  }

  const usable = usableMissions(missions.get(place.id) ?? [], themeIds, opts.allowDemo);
  if (usable.reason) {
    ex.push(usable.reason);
    return base("ineligible");
  }

  const policy = policies.get(place.accessPolicyId);
  if (!policy) {
    ex.push("no-access-policy");
    return base("unknown");
  }

  const route = estimateWalk(req.origin, place);
  if (route.minutes === null) {
    ex.push("route-unknown");
    return base("unknown");
  }

  const stay = policy.estimatedStayMinutes;
  const total = route.minutes + stay + ENGINE_CONFIG.clueMinutes + ENGINE_CONFIG.recordMinutes + ENGINE_CONFIG.safetyMarginMinutes;
  const common = { routeEstimateConfidence: route.confidence, estimatedTravelMinutes: route.minutes, estimatedTotalMinutes: total };
  if (total > req.durationMinutes) {
    ex.push("exceeds-duration");
    return base("ineligible", common);
  }

  if (policy.publicOutdoor) {
    const arrive = nowMinutes + route.minutes;
    if (arrive < ENGINE_CONFIG.outdoorStartMinutes || arrive > ENGINE_CONFIG.outdoorEndMinutes) {
      ex.push("night-outdoor");
      return base("ineligible", common);
    }
  }

  const access = evaluateAccess(policy, {
    arrivalIso: addMinutesIso(req.localDateTime, route.minutes),
    maxAdmissionFeeKrw: req.maxAdmissionFeeKrw,
    requireNoReservation: req.requireNoReservation,
    stayMinutes: stay,
    allowUnverified: opts.allowDemo,
  });
  if (access.eligibility !== "eligible") {
    ex.push(...access.reasons);
    return base(access.eligibility, common);
  }

  const visited = req.visitedPlaceIds.includes(place.id);
  const score =
    (visited ? 0.5 : 3) +
    (place.freshness === "verified" ? 2 : 0.5) +
    (route.confidence === "verified" ? 1 : 0.3) +
    Math.min(1, place.tags.length * 0.2) -
    route.minutes / 10;
  return { placeId: place.id, eligibility: "eligible", exclusions: [], score: Math.max(0.1, +score.toFixed(3)), ...common };
}

function buildSuggestions(req: MysteryRequest, cands: MissionCandidate[]): string[] {
  const s: string[] = [];
  const all = cands.flatMap((c) => c.exclusions);
  if (req.durationMinutes < 60 && all.includes("exceeds-duration")) s.push("extend-duration");
  if (all.includes("fee-exceeds-limit")) s.push("allow-paid");
  if (all.includes("reservation-required") && req.requireNoReservation) s.push("allow-reservation");
  if (all.includes("theme-mismatch")) s.push("any-theme");
  if (all.includes("route-unknown")) s.push("wider-area");
  if (s.length === 0) s.push("try-later");
  return s;
}
