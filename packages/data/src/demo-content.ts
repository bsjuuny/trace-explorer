import { SCHEMA_VERSION } from "@trace/schemas";

/**
 * 데모 전용 콘텐츠. 실제 업체·장소가 아니며 좌표는 종로5가역 인근의 임의 지점이다.
 * 검증 필드(verifiedBy, lastCheckedAt 등)는 의도적으로 null이다.
 */
const CV = "2026-11-19.1";

const source = {
  type: "manual" as const, sourceId: null, sourceUrl: null, license: null, attribution: null,
  verificationMethod: null, verifiedBy: null, lastCheckedAt: null, expiresAt: null,
};

type PlaceSeed = {
  id: string; name: string; lat: number; lng: number; categories: string[]; tags: string[];
  policy: string; walk: number | null; radius?: number; hint?: string;
};

const mkPlace = (p: PlaceSeed) => ({
  schemaVersion: SCHEMA_VERSION, contentVersion: CV,
  id: p.id, name: `[데모] ${p.name}`,
  coordinates: { lat: p.lat, lng: p.lng },
  categories: p.categories, tags: p.tags,
  source, freshness: "unknown" as const,
  publication: { status: "draft" as const, isDemo: true },
  accessPolicyId: p.policy,
  checkInPolicy: { radiusMeters: p.radius ?? 60, maxAccuracyMeters: 80 },
  missionTemplateIds: ["mystery-discovery-v1"],
  ...(p.hint ? { extraHint: p.hint } : {}),
  walkEstimate: p.walk === null ? null : { minutes: p.walk, confidence: "approximate" as const },
});

const all = [0, 1, 2, 3, 4, 5, 6];

const mkMission = (placeId: string, themeId: string, texts: [string, string, string]) => ({
  id: `m-${placeId}`, placeId, themeId, durationMinutes: 15 as const,
  clues: texts.map((text, i) => ({ order: i + 1, text, difficulty: (["hard", "medium", "easy"] as const)[i]!, reviewed: false })),
  rewardId: "reward-standard", safetyReviewed: false, reviewed: false,
});

export const demoContent = {
  schemaVersion: SCHEMA_VERSION,
  contentVersion: CV,
  expiresAt: "2027-02-28T00:00:00+09:00",
  themes: [
    { id: "bread", label: "빵·디저트", categories: ["bakery", "cafe"], active: true },
    { id: "food", label: "식당", categories: ["restaurant"], active: true },
    { id: "heritage", label: "문화유산", categories: ["heritage"], active: true },
    { id: "walk", label: "골목·산책", categories: ["alley", "park"], active: true },
  ],
  rewards: [
    { id: "reward-standard", xp: 100, badge: "explorer-1", repeatPolicy: "once" as const },
  ],
  accessPolicies: [
    { id: "daily-day", closedDays: [], windows: [{ days: all, open: "07:00", close: "21:00", lastEntryMinutesBeforeClose: 0, mode: "free-roam" as const }], fees: [{ feeKrw: 0 }], exceptions: [], publicOutdoor: false, estimatedStayMinutes: 3, hoursFreshness: "unknown" as const, feeFreshness: "unknown" as const },
    { id: "closed-monday", closedDays: [1], windows: [{ days: [0, 2, 3, 4, 5, 6], open: "10:00", close: "19:00", lastEntryMinutesBeforeClose: 30, mode: "free-roam" as const }], fees: [{ feeKrw: 0 }], exceptions: [], publicOutdoor: false, estimatedStayMinutes: 3, hoursFreshness: "unknown" as const, feeFreshness: "unknown" as const },
    { id: "late-night", closedDays: [], windows: [{ days: all, open: "18:00", close: "02:00", lastEntryMinutesBeforeClose: 30, mode: "free-roam" as const }], fees: [{ feeKrw: 0 }], exceptions: [], publicOutdoor: false, estimatedStayMinutes: 3, hoursFreshness: "unknown" as const, feeFreshness: "unknown" as const },
    {
      // 종묘형 경계 케이스(데모): 화 휴관, 수 무료, 월·목·금 시간제 해설, 주말 일반, 계절별 시간
      id: "heritage-jongmyo-style", closedDays: [2],
      windows: [
        { days: [1, 4, 5], open: "09:00", close: "18:00", lastEntryMinutesBeforeClose: 60, mode: "guided" as const },
        { days: [3, 6, 0], open: "09:00", close: "18:00", lastEntryMinutesBeforeClose: 60, mode: "free-roam" as const, months: [2, 3, 4, 5, 6, 7, 8, 9, 10] },
        { days: [3, 6, 0], open: "09:00", close: "17:30", lastEntryMinutesBeforeClose: 60, mode: "free-roam" as const, months: [1, 11, 12] },
      ],
      fees: [{ days: [3], feeKrw: 0, note: "수요일 무료(데모 규칙)" }, { feeKrw: 1000 }],
      exceptions: [], publicOutdoor: false, estimatedStayMinutes: 4, hoursFreshness: "unknown" as const, feeFreshness: "unknown" as const,
    },
    { id: "outdoor-public", closedDays: [], windows: [], fees: [{ feeKrw: 0 }], exceptions: [], publicOutdoor: true, estimatedStayMinutes: 2, hoursFreshness: "unknown" as const, feeFreshness: "unknown" as const },
    { id: "reservation-only", closedDays: [], windows: [{ days: all, open: "10:00", close: "18:00", lastEntryMinutesBeforeClose: 0, mode: "reservation-required" as const }], fees: [{ feeKrw: 0 }], exceptions: [], publicOutdoor: false, estimatedStayMinutes: 3, hoursFreshness: "unknown" as const, feeFreshness: "unknown" as const },
  ],
  places: [
    mkPlace({ id: "demo-bakery-001", name: "골목의 작은 빵집", lat: 37.5712, lng: 126.9992, categories: ["bakery", "cafe"], tags: ["bread", "local"], policy: "daily-day", walk: 4, hint: "간판 대신 나무 문패가 걸려 있고, 오전에 향이 가장 진해요." }),
    mkPlace({ id: "demo-cafe-002", name: "시장 옆 카페", lat: 37.5703, lng: 126.9981, categories: ["cafe"], tags: ["coffee"], policy: "closed-monday", walk: 4, hint: "시장 입구에서 한 블록, 창가에 작은 화분이 줄지어 있어요." }),
    mkPlace({ id: "demo-restaurant-003", name: "골목 안쪽 식당", lat: 37.5718, lng: 127.0001, categories: ["restaurant"], tags: ["soup"], policy: "daily-day", walk: 4, hint: "점심 직전이면 골목 입구까지 김이 새어 나와요." }),
    mkPlace({ id: "demo-bar-004", name: "심야 식당", lat: 37.5707, lng: 126.9996, categories: ["restaurant"], tags: ["night"], policy: "late-night", walk: 4, hint: "낮에는 닫힌 셔터만 보여요. 저녁 이후를 떠올려 보세요." }),
    mkPlace({ id: "demo-heritage-005", name: "고궁형 유산지", lat: 37.5726, lng: 126.9971, categories: ["heritage"], tags: ["heritage", "history"], policy: "heritage-jongmyo-style", walk: 7, radius: 100, hint: "정문을 마주 보고 오른쪽 돌담을 따라가 보세요." }),
    mkPlace({ id: "demo-alley-006", name: "이야기 골목", lat: 37.5714, lng: 126.9979, categories: ["alley"], tags: ["walk", "street"], policy: "outdoor-public", walk: 3, hint: "자동차가 들어갈 수 없을 만큼 좁아요. 벽을 눈높이로 살펴보세요." }),
    mkPlace({ id: "demo-museum-007", name: "예약제 작은 전시", lat: 37.5699, lng: 126.9990, categories: ["heritage"], tags: ["exhibit"], policy: "reservation-only", walk: 4, hint: "문 앞 안내판의 예약 문구를 먼저 읽어 보세요." }),
    mkPlace({ id: "demo-bakery-009", name: "골목 떡집", lat: 37.5718, lng: 126.9996, categories: ["bakery"], tags: ["rice-cake", "local"], policy: "daily-day", walk: 3, hint: "이른 아침에 김이 가장 많이 오르는 곳이에요. 문 옆 작은 시루를 찾아보세요." }),
    mkPlace({ id: "demo-cafe-010", name: "옥상 찻집", lat: 37.5702, lng: 126.9998, categories: ["cafe"], tags: ["tea", "rooftop"], policy: "closed-monday", walk: 3, hint: "올려다보면 간판보다 화분이 먼저 보이는 건물이에요." }),
    mkPlace({ id: "demo-restaurant-011", name: "곰탕 골목집", lat: 37.5714, lng: 126.9976, categories: ["restaurant"], tags: ["soup", "lunch"], policy: "daily-day", walk: 3, hint: "점심 줄이 길어서 골목 모퉁이까지 이어져요." }),
    mkPlace({ id: "demo-restaurant-012", name: "포장마차 거리", lat: 37.5698, lng: 126.9979, categories: ["restaurant"], tags: ["night", "street-food"], policy: "late-night", walk: 4, hint: "해가 진 뒤에 천막이 하나둘 펼쳐지는 길이에요." }),
    mkPlace({ id: "demo-heritage-013", name: "옛 우물터", lat: 37.5722, lng: 126.9978, categories: ["heritage"], tags: ["well", "history"], policy: "outdoor-public", walk: 4, radius: 80, hint: "바닥의 둥근 돌 표식을 찾아보세요." }),
    mkPlace({ id: "demo-alley-014", name: "벽화 골목", lat: 37.5705, lng: 127.0003, categories: ["alley"], tags: ["mural", "street"], policy: "outdoor-public", walk: 4, hint: "고개를 들면 담장 전체가 한 장의 그림이에요." }),
    mkPlace({ id: "demo-park-015", name: "작은 쉼터", lat: 37.5707, lng: 126.9969, categories: ["park"], tags: ["bench", "green"], policy: "outdoor-public", walk: 4, hint: "벤치 세 개와 오래된 나무 한 그루가 전부예요." }),
    mkPlace({ id: "demo-far-008", name: "먼 곳의 정원", lat: 37.5800, lng: 127.0100, categories: ["park"], tags: ["park"], policy: "outdoor-public", walk: null, hint: "걸어서는 꽤 멀어요. 이번 코스 밖일 수 있어요." }),
  ],
  missions: [
    mkMission("demo-bakery-001", "bread", ["문 앞에 밀가루 향이 번지는 작은 가게", "아침마다 줄이 생기는 골목", "간판에 곡식 그림이 있다"]),
    mkMission("demo-cafe-002", "bread", ["시장 소리와 커피 향이 섞이는 곳", "창가 자리가 유명한 곳", "시장 입구에서 한 블록"]),
    mkMission("demo-restaurant-003", "food", ["오래된 국물 냄새가 나는 골목", "점심시간마다 붐비는 곳", "좁은 골목 안쪽 모퉁이"]),
    mkMission("demo-bar-004", "food", ["해가 지면 불이 켜지는 곳", "밤에만 간판이 보이는 곳", "골목 끝 붉은 등"]),
    mkMission("demo-heritage-005", "heritage", ["담장 너머로 고요함이 느껴지는 곳", "오랜 왕실의 흔적이 남은 곳", "큰 문 앞 넓은 마당"]),
    mkMission("demo-alley-006", "walk", ["걸어야만 보이는 짧은 골목", "벽에 옛 사진이 걸린 길", "두 갈래가 만나는 곳"]),
    mkMission("demo-museum-007", "heritage", ["작지만 예약이 필요한 전시", "문 앞 안내판을 확인", "건물 2층 창이 보인다"]),
    mkMission("demo-bakery-009", "bread", ["이른 아침 김이 피어오르는 작은 가게", "명절 앞두고 줄이 길어지는 곳", "문 옆에 낡은 시루가 놓여 있다"]),
    mkMission("demo-cafe-010", "bread", ["계단을 올라야 만나는 조용한 찻집", "창밖으로 지붕들이 내려다보인다", "입구 화분이 간판 대신이다"]),
    mkMission("demo-restaurant-011", "food", ["뽀얀 국물 냄새가 골목을 채우는 곳", "정오 무렵 줄이 가장 길다", "모퉁이를 돌면 바로 나온다"]),
    mkMission("demo-restaurant-012", "food", ["밤이 되면 모습이 달라지는 길", "천막 아래 노란 전구가 줄지어 있다", "낮에는 빈 길로 보인다"]),
    mkMission("demo-heritage-013", "heritage", ["오래전 사람들이 물을 길던 자리", "지금은 돌 표식만 남았다", "바닥의 둥근 윤곽을 찾아라"]),
    mkMission("demo-alley-014", "walk", ["담장이 캔버스가 된 길", "계절마다 그림이 조금씩 바뀐다", "좁은 길 끝에서 한 번 꺾는다"]),
    mkMission("demo-park-015", "walk", ["건물 사이에 숨어 있는 작은 초록", "벤치 세 개가 마주 보고 있다", "큰 나무 아래가 목적지다"]),
    mkMission("demo-far-008", "walk", ["도심 속 숨은 초록", "넓은 잔디가 있는 곳", "먼 길을 가야 한다"]),
  ],
};
