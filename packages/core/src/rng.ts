export const RNG_ALGORITHM = "fnv1a32+mulberry32";

export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function makeRng(seed: string): () => number {
  let a = hashSeed(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 가중 무작위 선택. 입력 순서가 곧 안정 정렬 결과여야 재현된다. */
export function weightedPick<T>(items: T[], weights: number[], rng: () => number): T | undefined {
  const total = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (items.length === 0) return undefined;
  if (total <= 0) return items[0];
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= Math.max(0, weights[i] ?? 0);
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}
