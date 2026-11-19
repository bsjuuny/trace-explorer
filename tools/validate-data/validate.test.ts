import { describe, expect, it } from "vitest";
import { demoContent } from "@trace/data";
import { summarizeDiff, toPublicBundle, validateBundle } from "./validate";

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

describe("데이터 검증", () => {
  it("데모 콘텐츠는 구조 검증을 통과한다", () => {
    const r = validateBundle(demoContent, { public: false });
    expect(r.issues.filter((i) => i.level === "error")).toEqual([]);
  });
  it("데모 콘텐츠는 공개 기준을 통과하지 못한다(데모 노출 차단)", () => {
    const r = validateBundle(demoContent, { public: true });
    expect(r.issues.some((i) => i.message.includes("데모"))).toBe(true);
  });
  it("중복 ID를 잡는다", () => {
    const d = clone(demoContent);
    d.places.push(clone(d.places[0]!));
    const r = validateBundle(d, { public: false });
    expect(r.issues.some((i) => i.message.startsWith("중복 ID"))).toBe(true);
  });
  it("좌표 누락 draft는 경고, 공개 상태는 오류", () => {
    const d = clone(demoContent);
    d.places[0]!.coordinates = { lat: null as unknown as number, lng: null as unknown as number };
    expect(validateBundle(d, { public: false }).issues.some((i) => i.level === "warn")).toBe(true);
    d.places[0]!.publication.status = "published" as "draft";
    expect(validateBundle(d, { public: false }).issues.some((i) => i.level === "error")).toBe(true);
  });
  it("없는 장소·테마·보상 참조를 잡는다", () => {
    const d = clone(demoContent);
    d.missions[0]!.placeId = "nope";
    d.missions[0]!.themeId = "nope";
    d.missions[0]!.rewardId = "nope";
    const msgs = validateBundle(d, { public: false }).issues.map((i) => i.message);
    expect(msgs.filter((m) => m.startsWith("없는")).length).toBe(3);
  });
  it("스키마 버전이 다르면 파싱 실패", () => {
    const d = clone(demoContent) as { schemaVersion: number };
    d.schemaVersion = 99;
    const r = validateBundle(d, { public: false });
    expect(r.bundle).toBeNull();
    expect(r.issues.length).toBeGreaterThan(0);
  });
  it("공개 번들 변환은 관리자 메모와 검증자를 제거한다", () => {
    const d = clone(demoContent);
    (d.places[0] as Record<string, unknown>)["adminNote"] = "내부 메모";
    (d.places[0]!.source as { verifiedBy: string | null }).verifiedBy = "someone";
    const r = validateBundle(d, { public: false });
    const pub = toPublicBundle(r.bundle!);
    expect(JSON.stringify(pub)).not.toContain("내부 메모");
    expect(pub.places[0]!.source.verifiedBy).toBeNull();
  });
  it("diff 요약", () => {
    const r = validateBundle(demoContent, { public: false });
    const next = clone(r.bundle!);
    next.places.pop();
    const lines = summarizeDiff(r.bundle!, next);
    expect(lines.find((l) => l.startsWith("places"))).toBe("places: +0 -1 ~0");
  });
});
