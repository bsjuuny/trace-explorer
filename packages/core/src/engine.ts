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
  const themeCats = themeCategoryFilter(req, bundle);
  const now = toSeoul(req.localDateTime);

  const missionByPlace = new Map<string, Mission>();
  for (const m of bundle.missions) {
    if (!missionByPlace.has(m.placeId) && m.durationMinutes <= req.durationMinutes) missionByPlace.set(m.placeId, m);
  }

  // 안정 정렬을 위해 id 순
  const places = [...bundle.places].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const candidates = places.map((place) => evaluatePlace(place, req, policies, missionByPlace, themeCats, opts, now.minutes));

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
  const mission = missionByPlace.get(pick.placeId)!;
  return { status: "ok", mission, place, selected: pick, candidates, meta };
}

function themeCategoryFilter(req: MysteryRequest, bundle: ContentBundle): Set<string> | null {
  if (!req.themeIds || req.themeIds.length === 0) return null;
  const cats = new Set<string>();
  for (const t of bundle.themes) {
    if (t.active && req.themeIds.includes(t.id)) t.categories.forEach((c) => cats.add(c));
  }
  return cats;
}

function evaluatePlace(
  place: Place,
  req: MysteryRequest,
  policies: Map<string, AccessPolicy>,
  missions: Map<string, Mission>,
  themeCats: Set<string> | null,
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

  if (themeCats && !place.categories.some((c) => themeCats.has(c))) {
    ex.push("theme-mismatch");
    return base("ineligible");
  }

  const mission = missions.get(place.id);
  if (!mission) {
    ex.push("no-mission");
    return base("ineligible");
  }
  if (!opts.allowDemo && (!mission.reviewed || !mission.safetyReviewed || mission.clues.some((c) => !c.reviewed))) {
    ex.push("mission-not-reviewed");
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
