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

type Pol = { windows: unknown[]; fees: unknown[]; exceptions: unknown[] };
describe("운영시간·요금·공개 기준 보강", () => {
  const msgs = (d: unknown, pub = false) => validateBundle(d, { public: pub }).issues.filter((i) => i.level === "error").map((i) => i.message);

  it("같은 요일·시간이 겹치는 운영시간은 오류", () => {
    const d = clone(demoContent);
    const pol = d.accessPolicies.find((p) => p.id === "daily-day")! as unknown as Pol;
    pol.windows.push({ days: [1], open: "20:00", close: "23:00", lastEntryMinutesBeforeClose: 0, mode: "free-roam" as const });
    expect(msgs(d).some((m) => m.includes("겹침"))).toBe(true);
  });
  it("겹치지 않는 운영시간은 통과", () => {
    const d = clone(demoContent);
    const pol = d.accessPolicies.find((p) => p.id === "daily-day")! as unknown as Pol;
    pol.windows = [
      { days: [1], open: "07:00", close: "12:00", lastEntryMinutesBeforeClose: 0, mode: "free-roam" as const },
      { days: [1], open: "13:00", close: "21:00", lastEntryMinutesBeforeClose: 0, mode: "free-roam" as const },
    ];
    expect(msgs(d)).toEqual([]);
  });
  it("자정을 넘기는 운영시간이 다음 날 시작 구간과 겹치면 오류", () => {
    const d = clone(demoContent);
    const pol = d.accessPolicies.find((p) => p.id === "daily-day")! as unknown as Pol;
    pol.windows = [
      { days: [1], open: "22:00", close: "02:00", lastEntryMinutesBeforeClose: 0, mode: "free-roam" as const },
      { days: [2], open: "01:00", close: "05:00", lastEntryMinutesBeforeClose: 0, mode: "free-roam" as const },
    ];
    expect(msgs(d).some((m) => m.includes("겹침"))).toBe(true);
  });
  it("월 경계를 넘는 자정 꼬리(12월 → 1월)가 겹치면 오류", () => {
    const d = clone(demoContent);
    const pol = d.accessPolicies.find((p) => p.id === "daily-day")! as unknown as Pol;
    pol.windows = [
      { days: [0, 1, 2, 3, 4, 5, 6], open: "22:00", close: "02:00", lastEntryMinutesBeforeClose: 0, mode: "free-roam" as const, months: [12] },
      { days: [0, 1, 2, 3, 4, 5, 6], open: "01:00", close: "05:00", lastEntryMinutesBeforeClose: 0, mode: "free-roam" as const, months: [1] },
    ];
    expect(msgs(d).some((m) => m.includes("겹침"))).toBe(true);
  });
  it("달이 서로 다르고 인접하지 않으면 겹치지 않는다", () => {
    const d = clone(demoContent);
    const pol = d.accessPolicies.find((p) => p.id === "daily-day")! as unknown as Pol;
    pol.windows = [
      { days: [0, 1, 2, 3, 4, 5, 6], open: "22:00", close: "02:00", lastEntryMinutesBeforeClose: 0, mode: "free-roam" as const, months: [6] },
      { days: [0, 1, 2, 3, 4, 5, 6], open: "01:00", close: "05:00", lastEntryMinutesBeforeClose: 0, mode: "free-roam" as const, months: [1] },
    ];
    expect(msgs(d)).toEqual([]);
  });
  it("콘텐츠 버전 형식은 YYYY-MM-DD(.N)만 허용", () => {
    const ok = clone(demoContent);
    expect(validateBundle(ok, { public: false }).bundle).not.toBeNull();
    const bad = clone(demoContent);
    (bad as { contentVersion: string }).contentVersion = "v1.0.0-rc.1";
    expect(validateBundle(bad, { public: false }).bundle).toBeNull();
  });
  it("요금 규칙 중복은 오류", () => {
    const d = clone(demoContent);
    const pol = d.accessPolicies.find((p) => p.id === "daily-day")! as unknown as Pol;
    pol.fees.push({ feeKrw: 500 });
    expect(msgs(d).some((m) => m.includes("일반 요금"))).toBe(true);
    const e = clone(demoContent);
    const h = e.accessPolicies.find((p) => p.id === "heritage-jongmyo-style")! as unknown as Pol;
    h.fees.push({ days: [3], feeKrw: 100 });
    expect(msgs(e).some((m) => m.includes("요일 한정 요금"))).toBe(true);
  });
  it("특별 개방 기간이 서로 겹치면 오류", () => {
    const d = clone(demoContent);
    const pol = d.accessPolicies.find((p) => p.id === "daily-day")! as unknown as Pol;
    const base = { kind: "special-open" as const, open: "10:00", close: "12:00", mode: "free-roam" as const, lastEntryMinutesBeforeClose: 0 };
    pol.exceptions.push({ ...base, from: "2026-12-01", to: "2026-12-05" }, { ...base, from: "2026-12-05", to: "2026-12-06" });
    expect(msgs(d).some((m) => m.includes("특별 개방 기간"))).toBe(true);
  });
  it("미션 테마와 장소 분류가 어긋나면 경고", () => {
    const d = clone(demoContent);
    d.missions[0]!.themeId = "heritage";
    const w = validateBundle(d, { public: false }).issues.filter((i) => i.level === "warn");
    expect(w.some((i) => i.message.includes("분류가 겹치지 않음"))).toBe(true);
  });
  it("공개 기준: 운영시간 신선도·미션 없는 장소 차단", () => {
    const d = clone(demoContent);
    d.missions = d.missions.filter((m) => m.placeId !== d.places[0]!.id);
    const m = msgs(d, true);
    expect(m.some((x) => x.includes("미션이 없음"))).toBe(true);
    expect(m.some((x) => x.includes("운영시간 신선도"))).toBe(true);
  });
});
