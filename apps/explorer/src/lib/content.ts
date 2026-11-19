import { StaticPlaceRepository } from "@trace/core";
import type { ContentBundle } from "@trace/schemas";

export type LoadedContent = { bundle: ContentBundle; rolledBack: boolean };

const base = import.meta.env.BASE_URL;

/**
 * 최신 콘텐츠를 읽고 Zod로 검증한다. 실패하면 직전 정상본(content.prev.json)으로 되돌린다.
 * 둘 다 실패하면 오류를 던진다.
 */
export async function loadContent(): Promise<LoadedContent> {
  try {
    const bundle = await new StaticPlaceRepository(`${base}content/content.json`).getBundle();
    return { bundle, rolledBack: false };
  } catch {
    const bundle = await new StaticPlaceRepository(`${base}content/content.prev.json`).getBundle();
    return { bundle, rolledBack: true };
  }
}
