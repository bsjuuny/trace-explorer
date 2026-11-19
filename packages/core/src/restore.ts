import { emptyProgress, type DexEntry, type ProgressState } from "./rewards";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * 저장소(IndexedDB)에서 복원한 진행 상태를 검증한다. 형식이 맞지 않거나 손상된 항목은 버리고,
 * 구조 자체가 틀리면 빈 상태로 되돌린다(클라이언트 변조·구버전 데이터에 의한 크래시 방지).
 */
export function restoreProgress(raw: unknown): ProgressState {
  if (!isObj(raw)) return emptyProgress();
  const xp = typeof raw["xp"] === "number" && Number.isFinite(raw["xp"]) && raw["xp"] >= 0 ? Math.floor(raw["xp"]) : 0;
  const completedKeys = Array.isArray(raw["completedKeys"]) ? raw["completedKeys"].filter((k): k is string => typeof k === "string") : [];
  const dex: Record<string, DexEntry> = {};
  if (isObj(raw["dex"])) {
    for (const [id, e] of Object.entries(raw["dex"])) {
      if (id === "__proto__" || !isObj(e) || e["placeId"] !== id || typeof e["firstVisitedAt"] !== "string" || typeof e["verified"] !== "boolean") continue;
      const badge = typeof e["badge"] === "string" ? e["badge"] : null;
      dex[id] = { placeId: id, firstVisitedAt: e["firstVisitedAt"], verified: e["verified"], badge };
    }
  }
  return { xp, dex, completedKeys };
}
