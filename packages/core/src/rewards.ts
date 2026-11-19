import type { Reward } from "@trace/schemas";

export type DexEntry = { placeId: string; firstVisitedAt: string; verified: boolean; badge: string | null };
export type ProgressState = { xp: number; dex: Record<string, DexEntry>; completedKeys: string[] };
export type CompletionMethod = "checked-in" | "self-reported";

export const emptyProgress = (): ProgressState => ({ xp: 0, dex: {}, completedKeys: [] });

export const completionKey = (missionId: string, placeId: string, startedAt: string) =>
  `${missionId}:${placeId}:${startedAt}`;

export type CompletionInput = {
  missionId: string;
  placeId: string;
  startedAt: string;
  completedAt: string;
  method: CompletionMethod;
  reward: Reward;
};

/**
 * 멱등: 같은 키의 재호출은 상태를 바꾸지 않는다.
 * self-reported(현장 인증 없는 대체 완료)는 XP 0, 도감에는 미인증으로만 기록한다.
 */
export function applyCompletion(
  state: ProgressState,
  c: CompletionInput,
): { state: ProgressState; granted: number; duplicate: boolean } {
  const key = completionKey(c.missionId, c.placeId, c.startedAt);
  if (state.completedKeys.includes(key)) return { state, granted: 0, duplicate: true };

  const existing = state.dex[c.placeId];
  const verified = c.method === "checked-in";
  let granted = verified ? c.reward.xp : 0;
  // 이미 현장 인증을 마친 장소만 once 정책으로 XP를 막는다. 미인증 기록 → 현장 인증 승격은 XP를 지급한다.
  if (existing?.verified && c.reward.repeatPolicy === "once") granted = 0;

  const dex = { ...state.dex };
  if (!existing || (!existing.verified && verified)) {
    dex[c.placeId] = {
      placeId: c.placeId,
      firstVisitedAt: existing?.firstVisitedAt ?? c.completedAt,
      verified,
      badge: verified ? c.reward.badge : null,
    };
  }
  return { state: { xp: state.xp + granted, dex, completedKeys: [...state.completedKeys, key] }, granted, duplicate: false };
}
