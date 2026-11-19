import { z } from "zod";

export const SCHEMA_VERSION = 1;

export const Eligibility = z.enum(["eligible", "ineligible", "unknown"]);
export type Eligibility = z.infer<typeof Eligibility>;

export const Freshness = z.enum(["verified", "stale", "unknown", "conflicting"]);
export type Freshness = z.infer<typeof Freshness>;

export const Coordinates = z.object({
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
});

/** YYYY-MM-DD(실존 날짜) */
const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s), "invalid date");
/** 파싱 가능한 ISO 8601 일시(오프셋 포함) */
const IsoDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/).refine((s) => !Number.isNaN(Date.parse(s)), "invalid datetime");

export const Source = z.object({
  type: z.enum(["manual", "public-data", "field-survey"]),
  sourceId: z.string().nullable(),
  sourceUrl: z.string().url().regex(/^https?:\/\//i, "http(s) 주소만 허용").nullable(),
  license: z.string().nullable(),
  attribution: z.string().nullable(),
  verificationMethod: z.string().nullable(),
  verifiedBy: z.string().nullable(),
  lastCheckedAt: IsoDateTime.nullable(),
  expiresAt: IsoDateTime.nullable(),
});

/** HH:MM, 종료가 시작보다 작거나 같으면 자정을 넘기는 구간으로 해석 */
const Hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const AccessMode = z.enum(["free-roam", "timed", "guided", "reservation-required", "unknown"]);
export type AccessMode = z.infer<typeof AccessMode>;

export const OpeningWindow = z.object({
  /** 0=일 … 6=토 */
  days: z.array(z.number().int().min(0).max(6)).min(1),
  open: Hhmm,
  close: Hhmm,
  /** 입장 마감 (분 단위, close 기준 몇 분 전) */
  lastEntryMinutesBeforeClose: z.number().int().min(0).default(0),
  mode: AccessMode,
  /** 적용 월(1~12). 비우면 연중 */
  months: z.array(z.number().int().min(1).max(12)).optional(),
});
export type OpeningWindow = z.infer<typeof OpeningWindow>;

export const FeeRule = z.object({
  days: z.array(z.number().int().min(0).max(6)).optional(),
  feeKrw: z.number().int().min(0),
  note: z.string().optional(),
});

export const Exception = z.object({
  from: DateOnly,
  to: DateOnly,
  kind: z.enum(["closed", "special-open"]),
  note: z.string().optional(),
});

export const AccessPolicy = z.object({
  id: z.string().min(1),
  /** 정기 휴관 요일 */
  closedDays: z.array(z.number().int().min(0).max(6)).default([]),
  windows: z.array(OpeningWindow).default([]),
  fees: z.array(FeeRule).default([]),
  exceptions: z.array(Exception).default([]),
  /** 외부 공공구역에서 항상 완료 가능한지 (야외 미션) */
  publicOutdoor: z.boolean().default(false),
  estimatedStayMinutes: z.number().int().min(0).default(3),
  /** 운영정보 신선도 (필드별) */
  hoursFreshness: Freshness.default("unknown"),
  feeFreshness: Freshness.default("unknown"),
});
export type AccessPolicy = z.infer<typeof AccessPolicy>;

export const Place = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  contentVersion: z.string(),
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().min(1),
  coordinates: Coordinates,
  categories: z.array(z.string()).min(1),
  tags: z.array(z.string()).default([]),
  source: Source,
  freshness: Freshness,
  publication: z.object({
    status: z.enum(["draft", "validated", "published"]),
    isDemo: z.boolean(),
  }),
  accessPolicyId: z.string(),
  checkInPolicy: z.object({
    radiusMeters: z.number().positive(),
    maxAccuracyMeters: z.number().positive(),
  }),
  missionTemplateIds: z.array(z.string()).default([]),
  /** 출발점(종로5가역)에서 사전 측정된 도보 ETA. 미측정이면 null */
  walkEstimate: z
    .object({
      minutes: z.number().positive(),
      confidence: z.enum(["verified", "approximate", "unknown"]),
    })
    .nullable()
    .default(null),
  /** 선택: 탐험 중 "추가 힌트" 버튼에 보여줄 장소별 힌트(목적지 이름을 직접 말하지 않는 문장). 공개 필드 */
  extraHint: z.string().trim().min(1).max(120).optional(),
  /** 공개 금지: 관리자 메모 */
  adminNote: z.string().optional(),
});
export type Place = z.infer<typeof Place>;

export const Clue = z.object({
  order: z.number().int().min(1).max(3),
  text: z.string().min(1),
  difficulty: z.enum(["easy", "medium", "hard"]),
  reviewed: z.boolean(),
});

export const Theme = z.object({
  id: z.string(),
  label: z.string(),
  categories: z.array(z.string()),
  active: z.boolean(),
});
export type Theme = z.infer<typeof Theme>;

export const Reward = z.object({
  id: z.string(),
  xp: z.number().int().min(0),
  badge: z.string().nullable(),
  /** 같은 장소 재방문 시 XP 지급 여부 */
  repeatPolicy: z.enum(["once", "none"]),
});
export type Reward = z.infer<typeof Reward>;

export const Mission = z.object({
  id: z.string(),
  placeId: z.string(),
  themeId: z.string(),
  durationMinutes: z.union([z.literal(15), z.literal(30), z.literal(60)]),
  clues: z.array(Clue).length(3),
  rewardId: z.string(),
  safetyReviewed: z.boolean(),
  reviewed: z.boolean(),
});
export type Mission = z.infer<typeof Mission>;
export type Clue = z.infer<typeof Clue>;

export const ContentBundle = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  contentVersion: z.string(),
  /** 이 시각 이후엔 신규 탐험을 경고/차단 */
  expiresAt: IsoDateTime,
  places: z.array(Place),
  accessPolicies: z.array(AccessPolicy),
  themes: z.array(Theme),
  missions: z.array(Mission),
  rewards: z.array(Reward),
});
export type ContentBundle = z.infer<typeof ContentBundle>;

/** 공개 번들에서 제거해야 하는 필드 */
export const FORBIDDEN_PUBLIC_FIELDS = ["adminNote", "verifiedBy"] as const;

export type Origin = { lat: number; lng: number };

export type MysteryRequest = {
  origin: Origin;
  durationMinutes: 15 | 30 | 60;
  themeIds: string[] | null;
  maxAdmissionFeeKrw: number;
  requireNoReservation: boolean;
  visitedPlaceIds: string[];
  /** ISO 8601 with +09:00 offset */
  localDateTime: string;
  randomSeed?: string;
};

export type MissionCandidate = {
  placeId: string;
  eligibility: Eligibility;
  exclusions: string[];
  score: number;
  routeEstimateConfidence: "verified" | "approximate" | "unknown";
  estimatedTravelMinutes: number | null;
  estimatedTotalMinutes: number | null;
};
