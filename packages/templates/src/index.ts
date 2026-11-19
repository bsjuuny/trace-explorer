import type { AccessPolicy, Mission, Reward, Theme } from "@trace/schemas";

/** 어드민이 새 항목을 만들 때 쓰는 빈 템플릿. 모든 검수 플래그는 false로 시작한다. */
export const newTheme = (): Theme => ({ id: "", label: "", categories: [], active: false });

export const newReward = (): Reward => ({ id: "", xp: 100, badge: null, repeatPolicy: "once" });

export const newAccessPolicy = (): AccessPolicy => ({
  id: "", closedDays: [], windows: [], fees: [], exceptions: [], publicOutdoor: false,
  estimatedStayMinutes: 3, hoursFreshness: "unknown", feeFreshness: "unknown",
});

export const newMission = (placeId = "", themeId = ""): Mission => ({
  id: "", placeId, themeId, durationMinutes: 15, rewardId: "", safetyReviewed: false, reviewed: false,
  clues: [1, 2, 3].map((order) => ({ order, text: "", difficulty: (["hard", "medium", "easy"] as const)[order - 1]!, reviewed: false })),
});
