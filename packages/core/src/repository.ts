import { ContentBundle } from "@trace/schemas";

export interface PlaceRepository {
  getBundle(): Promise<ContentBundle>;
}

/** 정적 JSON을 읽어 Zod로 검증한다. 향후 ApiPlaceRepository로 교체해도 상위 코드는 변하지 않는다. */
export class StaticPlaceRepository implements PlaceRepository {
  constructor(private readonly source: string | unknown) {}

  async getBundle(): Promise<ContentBundle> {
    let raw: unknown = this.source;
    if (typeof this.source === "string") {
      const res = await fetch(this.source, { cache: "no-cache" });
      if (!res.ok) throw new Error(`content fetch failed: ${res.status}`);
      raw = await res.json();
    }
    return ContentBundle.parse(raw);
  }
}
