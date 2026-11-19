import { describe, expect, it } from "vitest";
import { demoBundle } from "@trace/data";
import type { MysteryRequest, Place } from "@trace/schemas";
import {
  acquireFix, applyCompletion, emptyProgress, evaluateAccess, evaluateCheckIn, generateMystery, JONGNO5GA_STATION,
  makeRng, toSeoul, type GeoProvider,
} from "./index";

const heritage = demoBundle.accessPolicies.find((p) => p.id === "heritage-jongmyo-style")!;
const lateNight = demoBundle.accessPolicies.find((p) => p.id === "late-night")!;

const q = (iso: string, extra: Partial<Parameters<typeof evaluateAccess>[1]> = {}) => ({
  arrivalIso: iso, maxAdmissionFeeKrw: 0, requireNoReservation: false, stayMinutes: 4, allowUnverified: true, ...extra,
});

describe("Asia/Seoul 시간 계산", () => {
  it("UTC 입력도 KST 요일·시각으로 변환한다", () => {
    const t = toSeoul("2026-11-17T15:30:00Z"); // KST 11-18 00:30 수요일
    expect(t.date).toBe("2026-11-18");
    expect(t.dow).toBe(3);
    expect(t.minutes).toBe(30);
  });
});

describe("접근 규칙(종묘형 경계)", () => {
  it("화요일은 정기 휴관", () => {
    const r = evaluateAccess(heritage, q("2026-11-17T10:00:00+09:00"));
    expect(r.eligibility).toBe("ineligible");
    expect(r.reasons).toContain("closed-day");
  });
  it("수요일은 무료 일반관람 가능", () => {
    const r = evaluateAccess(heritage, q("2026-11-18T10:00:00+09:00"));
    expect(r.eligibility).toBe("eligible");
    expect(r.feeKrw).toBe(0);
  });
  it("목요일은 시간제 해설관람이라 자유 방문 불가", () => {
    const r = evaluateAccess(heritage, q("2026-11-19T10:00:00+09:00"));
    expect(r.eligibility).toBe("ineligible");
    expect(r.reasons).toContain("guided-only");
  });
  it("일요일 요금은 무료 한도 초과, 한도를 올리면 가능", () => {
    const sun = "2026-11-22T10:00:00+09:00";
    expect(evaluateAccess(heritage, q(sun)).reasons).toContain("fee-exceeds-limit");
    expect(evaluateAccess(heritage, q(sun, { maxAdmissionFeeKrw: 1000 })).eligibility).toBe("eligible");
  });
  it("11월 일요일은 17:30 종료·입장 마감 60분 전: 16:40 도착은 마감 후", () => {
    const r = evaluateAccess(heritage, q("2026-11-22T16:40:00+09:00", { maxAdmissionFeeKrw: 1000 }));
    expect(r.eligibility).toBe("ineligible");
    expect(r.reasons).toContain("last-entry-passed");
  });
  it("시간표가 검증되지 않았으면 보수적으로 unknown", () => {
    const r = evaluateAccess(heritage, q("2026-11-18T10:00:00+09:00", { allowUnverified: false }));
    expect(r.eligibility).toBe("unknown");
  });
  it("자정을 넘기는 영업시간: 01:00 가능, 02:30 불가", () => {
    expect(evaluateAccess(lateNight, q("2026-11-19T01:00:00+09:00", { stayMinutes: 3 })).eligibility).toBe("eligible");
    expect(evaluateAccess(lateNight, q("2026-11-19T02:30:00+09:00", { stayMinutes: 3 })).eligibility).toBe("ineligible");
  });
});

const baseReq = (over: Partial<MysteryRequest> = {}): MysteryRequest => ({
  origin: JONGNO5GA_STATION, durationMinutes: 15, themeIds: null, maxAdmissionFeeKrw: 0,
  requireNoReservation: true, visitedPlaceIds: [], localDateTime: "2026-11-19T10:00:00+09:00", randomSeed: "s1", ...over,
});
const demoOpts = { allowDemo: true, nowIso: "2026-11-19T10:00:00+09:00" };

describe("미스터리 생성 엔진", () => {
  it("같은 seed·입력이면 같은 결과", () => {
    const a = generateMystery(baseReq(), demoBundle, demoOpts);
    const b = generateMystery(baseReq(), demoBundle, demoOpts);
    expect(a.status).toBe("ok");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it("후보 순서가 달라도 같은 결과(안정 정렬)", () => {
    const shuffled = { ...demoBundle, places: [...demoBundle.places].reverse() };
    const a = generateMystery(baseReq(), demoBundle, demoOpts);
    const b = generateMystery(baseReq(), shuffled, demoOpts);
    expect(a.status === "ok" && b.status === "ok" && a.place.id === b.place.id).toBe(true);
  });
  it("seed를 바꾸면 여러 장소가 선택될 수 있다(다양성)", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const r = generateMystery(baseReq({ randomSeed: `seed-${i}` }), demoBundle, demoOpts);
      if (r.status === "ok") ids.add(r.place.id);
    }
    expect(ids.size).toBeGreaterThan(1);
  });
  it("메타에 알고리즘·가중치·PRNG 버전이 기록된다", () => {
    const r = generateMystery(baseReq(), demoBundle, demoOpts);
    expect(r.meta.engineVersion).toBeTruthy();
    expect(r.meta.weightsVersion).toBeTruthy();
    expect(r.meta.rng).toContain("mulberry32");
  });
  it("15분 초과 후보와 경로 불명 후보는 제외", () => {
    const r = generateMystery(baseReq(), demoBundle, demoOpts);
    const byId = Object.fromEntries(r.candidates.map((c) => [c.placeId, c]));
    expect(byId["demo-heritage-005"]!.exclusions).toContain("exceeds-duration");
    expect(byId["demo-far-008"]!.exclusions).toContain("route-unknown");
  });
  it("예약 불필요 옵션이면 예약제 장소 제외", () => {
    const r = generateMystery(baseReq(), demoBundle, demoOpts);
    expect(r.candidates.find((c) => c.placeId === "demo-museum-007")!.exclusions).toContain("reservation-required");
  });
  it("야간에는 야외 미션을 제외", () => {
    const r = generateMystery(baseReq({ localDateTime: "2026-11-19T22:00:00+09:00" }), demoBundle, demoOpts);
    expect(r.candidates.find((c) => c.placeId === "demo-alley-006")!.exclusions).toContain("night-outdoor");
  });
  it("공개 모드(allowDemo=false)에서는 데모·미검증 장소를 선택하지 않는다", () => {
    const r = generateMystery(baseReq(), demoBundle, { allowDemo: false, nowIso: demoOpts.nowIso });
    expect(r.status).toBe("none");
    expect(r.candidates.every((c) => c.eligibility !== "eligible")).toBe(true);
  });
  it("콘텐츠 만료 시 공개 모드는 신규 탐험 차단", () => {
    const r = generateMystery(baseReq(), demoBundle, { allowDemo: false, nowIso: "2027-06-01T00:00:00+09:00" });
    expect(r.status).toBe("none");
    expect(r.meta.expired).toBe(true);
  });
  it("후보가 없으면 먼 장소를 고르지 않고 제안을 돌려준다", () => {
    // 심야에는 야외 장소와 가이드 전용 유산지가 모두 제외된다.
    const r = generateMystery(baseReq({ themeIds: ["heritage"], localDateTime: "2026-11-19T22:00:00+09:00" }), demoBundle, { allowDemo: true, nowIso: "2026-11-19T22:00:00+09:00" });
    expect(r.status).toBe("none");
    if (r.status === "none") expect(r.suggestions.length).toBeGreaterThan(0);
  });
  it("PRNG는 seed마다 결정적", () => {
    expect(makeRng("a")()).toBe(makeRng("a")());
    expect(makeRng("a")()).not.toBe(makeRng("b")());
  });
});

const place: Place = { ...demoBundle.places[0]!, coordinates: { lat: 37.5712, lng: 126.9992 } };
const NOW = 1_000_000;

describe("체크인 판정", () => {
  const fix = (over: Partial<{ lat: number; lng: number; accuracy: number; timestamp: number }> = {}) => ({
    lat: 37.5712, lng: 126.9992, accuracy: 20, timestamp: NOW, ...over,
  });
  it("범위·정확도·시각이 모두 맞으면 성공", () => {
    expect(evaluateCheckIn(place, fix(), NOW).ok).toBe(true);
  });
  it("저정확도는 거리가 맞아도 실패", () => {
    expect(evaluateCheckIn(place, fix({ accuracy: 500 }), NOW).reason).toBe("low-accuracy");
  });
  it("멀면 실패, 오래된 측정값도 실패, 측정 없음도 실패", () => {
    expect(evaluateCheckIn(place, fix({ lat: 37.58 }), NOW).reason).toBe("too-far");
    expect(evaluateCheckIn(place, fix({ timestamp: NOW - 60_000 }), NOW).reason).toBe("stale-fix");
    expect(evaluateCheckIn(place, fix({ timestamp: NOW + 60_000 }), NOW).ok).toBe(false); // 미래 시각
    expect(evaluateCheckIn(place, fix({ accuracy: Number.NaN }), NOW).ok).toBe(false);
    expect(evaluateCheckIn(place, fix({ accuracy: -1 }), NOW).ok).toBe(false);
    expect(evaluateCheckIn(place, fix({ lat: Number.NaN }), NOW).ok).toBe(false);
    expect(evaluateCheckIn(place, null, NOW).reason).toBe("no-fix");
  });
});

describe("위치 획득", () => {
  const geoSeq = (codes: Array<number | "ok">): GeoProvider => {
    let i = 0;
    return {
      getCurrentPosition(ok, err) {
        const c = codes[Math.min(i++, codes.length - 1)]!;
        if (c === "ok") ok({ coords: { latitude: 37.5, longitude: 127, accuracy: 10 }, timestamp: 1 });
        else err({ code: c });
      },
    };
  };
  it("거부는 재시도하지 않는다", async () => {
    const r = await acquireFix(geoSeq([1]), { timeoutMs: 100, maxAttempts: 3 });
    expect(r).toEqual({ status: "denied", attempts: 1 });
  });
  it("timeout 후 재시도로 성공", async () => {
    const r = await acquireFix(geoSeq([3, "ok"]), { timeoutMs: 100, maxAttempts: 3 });
    expect(r.status).toBe("ok");
    expect(r.attempts).toBe(2);
  });
  it("계속 timeout이면 최대 횟수 후 실패, Geolocation 없으면 unavailable", async () => {
    expect((await acquireFix(geoSeq([3]), { timeoutMs: 100, maxAttempts: 2 })).status).toBe("timeout");
    expect((await acquireFix(undefined, { timeoutMs: 100, maxAttempts: 2 })).status).toBe("unavailable");
  });
});

describe("보상 멱등성", () => {
  const reward = demoBundle.rewards[0]!;
  const input = { missionId: "m1", placeId: "p1", startedAt: "t0", completedAt: "t1", method: "checked-in" as const, reward };
  it("같은 완료 이벤트를 두 번 처리해도 XP는 한 번", () => {
    const a = applyCompletion(emptyProgress(), input);
    const b = applyCompletion(a.state, input);
    expect(a.granted).toBe(100);
    expect(b.duplicate).toBe(true);
    expect(b.state.xp).toBe(100);
  });
  it("같은 장소 재방문은 once 정책이라 XP 없음", () => {
    const a = applyCompletion(emptyProgress(), input);
    const b = applyCompletion(a.state, { ...input, startedAt: "t9" });
    expect(b.granted).toBe(0);
    expect(Object.keys(b.state.dex)).toHaveLength(1);
  });
  it("현장 인증 없는 대체 완료는 XP 0, 도감에는 미인증으로 기록", () => {
    const a = applyCompletion(emptyProgress(), { ...input, method: "self-reported" });
    expect(a.granted).toBe(0);
    expect(a.state.dex["p1"]!.verified).toBe(false);
  });
  it("대체 완료 후 현장 인증하면 인증 상태로 승격", () => {
    const a = applyCompletion(emptyProgress(), { ...input, method: "self-reported" });
    const b = applyCompletion(a.state, { ...input, startedAt: "t2" });
    expect(b.state.dex["p1"]!.verified).toBe(true);
    expect(b.granted).toBe(input.reward.xp); // 승격 시 XP 지급
    expect(b.state.xp).toBe(input.reward.xp);
  });
  it("현장 인증 후 같은 장소 재방문은 once 정책으로 XP 없음", () => {
    const a = applyCompletion(emptyProgress(), input);
    const b = applyCompletion(a.state, { ...input, startedAt: "t3" });
    expect(b.granted).toBe(0);
  });
});

import { Exception, ContentBundle } from "@trace/schemas";
import { demoContent } from "@trace/data";
describe("날짜 스키마", () => {
  it("예외 기간은 실존 YYYY-MM-DD만 허용", () => {
    expect(Exception.safeParse({ from: "2026-11-19", to: "2026-11-20", kind: "closed" }).success).toBe(true);
    expect(Exception.safeParse({ from: "2026/11/19", to: "2026-11-20", kind: "closed" }).success).toBe(false);
    expect(Exception.safeParse({ from: "2027-02-30", to: "2027-03-01", kind: "closed" }).success).toBe(false);
  });
  it("번들 expiresAt이 파싱 불가면 거부", () => {
    expect(ContentBundle.safeParse({ ...demoContent, expiresAt: "never" }).success).toBe(false);
    expect(ContentBundle.safeParse(demoContent).success).toBe(true);
  });
});

import { restoreProgress } from "./restore";
describe("restoreProgress", () => {
  it("손상된 저장 상태는 버리거나 빈 상태로", () => {
    expect(restoreProgress(null)).toEqual({ xp: 0, dex: {}, completedKeys: [] });
    expect(restoreProgress({ xp: "999", dex: 5, completedKeys: "x" })).toEqual({ xp: 0, dex: {}, completedKeys: [] });
    const r = restoreProgress({ xp: 120.7, dex: { a: { placeId: "a", firstVisitedAt: "t", verified: true, badge: null }, b: { placeId: "zzz" } }, completedKeys: ["k", 3] });
    expect(r.xp).toBe(120);
    expect(Object.keys(r.dex)).toEqual(["a"]);
    expect(r.completedKeys).toEqual(["k"]);
  });
  it("__proto__ 키는 무시", () => {
    const raw = JSON.parse('{"xp":1,"dex":{"__proto__":{"placeId":"__proto__","firstVisitedAt":"t","verified":true}},"completedKeys":[]}');
    expect(Object.keys(restoreProgress(raw).dex)).toEqual([]);
  });
});

import { Place as PlaceSchema } from "@trace/schemas";
describe("장소 추가 힌트", () => {
  const base = demoBundle.places[0]!;
  it("선택 필드이며 120자를 넘기면 거부", () => {
    expect(PlaceSchema.safeParse(base).success).toBe(true);
    expect(PlaceSchema.safeParse({ ...base, extraHint: "문 앞 화분을 찾아보세요." }).success).toBe(true);
    expect(PlaceSchema.safeParse({ ...base, extraHint: "가".repeat(121) }).success).toBe(false);
    expect(PlaceSchema.safeParse({ ...base, extraHint: "   " }).success).toBe(false);
  });
  it("데모 장소는 모두 힌트가 있고 이름을 직접 말하지 않음", () => {
    for (const p of demoBundle.places) {
      expect(p.extraHint, p.id).toBeTruthy();
      expect(p.extraHint!.includes(p.name.replace("[데모] ", "")), p.id).toBe(false);
    }
  });
});

import { Exception as ExceptionSchema } from "@trace/schemas";
describe("특별 개방 예외(special-open)", () => {
  const verified = { ...heritage, hoursFreshness: "verified" as const, feeFreshness: "verified" as const };
  const open = (over: Record<string, unknown> = {}) =>
    ExceptionSchema.parse({ from: "2026-11-17", to: "2026-11-17", kind: "special-open", open: "10:00", close: "17:00", mode: "free-roam", feeKrw: 0, ...over });
  const withEx = (...exceptions: ReturnType<typeof open>[]) => ({ ...verified, exceptions });

  it("정기 휴관일(화)에도 특별 개방 시간 안이면 가능", () => {
    const r = evaluateAccess(withEx(open()), q("2026-11-17T11:00:00+09:00", { allowUnverified: false }));
    expect(r.reasons).toEqual([]);
    expect(r.eligibility).toBe("eligible");
  });
  it("개방 기간 안이지만 시간 밖이면 운영시간 외", () => {
    const r = evaluateAccess(withEx(open()), q("2026-11-17T18:00:00+09:00", { allowUnverified: false }));
    expect(r.eligibility).toBe("ineligible");
    expect(r.reasons).toContain("outside-hours");
  });
  it("시간표가 검증되지 않았으면 특별 개방도 통과시키지 않음", () => {
    const r = evaluateAccess({ ...withEx(open()), hoursFreshness: "unknown" }, q("2026-11-17T11:00:00+09:00", { allowUnverified: false }));
    expect(r.eligibility).toBe("unknown");
  });
  it("같은 기간의 closed 예외가 항상 우선", () => {
    const closed = ExceptionSchema.parse({ from: "2026-11-17", to: "2026-11-17", kind: "closed" });
    const r = evaluateAccess(withEx(open(), closed), q("2026-11-17T11:00:00+09:00", { allowUnverified: false }));
    expect(r.reasons).toContain("exception-closed");
  });
  it("자정을 넘기는 특별 개방: 시작일 다음 날 01:00도 같은 구간", () => {
    const ex = open({ from: "2026-11-20", to: "2026-11-20", open: "22:00", close: "02:00" });
    expect(evaluateAccess(withEx(ex), q("2026-11-21T01:00:00+09:00", { allowUnverified: false, stayMinutes: 3 })).eligibility).toBe("eligible");
    expect(evaluateAccess(withEx(ex), q("2026-11-20T23:00:00+09:00", { allowUnverified: false, stayMinutes: 3 })).eligibility).toBe("eligible");
    expect(evaluateAccess(withEx(ex), q("2026-11-21T03:00:00+09:00", { allowUnverified: false, stayMinutes: 3 })).eligibility).not.toBe("eligible");
  });
  it("입장 마감과 특별 요금 적용", () => {
    const ex = open({ lastEntryMinutesBeforeClose: 60, feeKrw: 2000 });
    const late = evaluateAccess(withEx(ex), q("2026-11-17T16:30:00+09:00", { allowUnverified: false, maxAdmissionFeeKrw: 5000 }));
    expect(late.reasons).toContain("last-entry-passed");
    const paid = evaluateAccess(withEx(ex), q("2026-11-17T11:00:00+09:00", { allowUnverified: false, maxAdmissionFeeKrw: 1000 }));
    expect(paid.feeKrw).toBe(2000);
    expect(paid.reasons).toContain("fee-exceeds-limit");
  });
  it("스키마: special-open은 시간·모드 필수, 기간 역전 불가", () => {
    expect(ExceptionSchema.safeParse({ from: "2026-11-17", to: "2026-11-17", kind: "special-open" }).success).toBe(false);
    expect(ExceptionSchema.safeParse({ from: "2026-11-18", to: "2026-11-17", kind: "closed" }).success).toBe(false);
    expect(ExceptionSchema.safeParse({ from: "2026-11-17", to: "2026-11-17", kind: "closed" }).success).toBe(true);
  });
});

describe("미션 단위 후보 평가", () => {
  const bakery = demoBundle.places.find((p) => p.id === "demo-bakery-001")!;
  const m0 = demoBundle.missions.find((m) => m.placeId === bakery.id)!;
  const clone = (id: string, themeId: string, reviewed: boolean) => ({
    ...m0, id, themeId, reviewed, safetyReviewed: reviewed, clues: m0.clues.map((c) => ({ ...c, reviewed })),
  });
  const livePlace = {
    ...bakery,
    freshness: "verified" as const,
    publication: { status: "published" as const, isDemo: false },
    source: { ...bakery.source, expiresAt: "2027-12-31T00:00:00+09:00" },
  };
  const liveBundle = (missions: typeof demoBundle.missions) => ({
    ...demoBundle,
    expiresAt: "2027-12-31T00:00:00+09:00",
    places: [livePlace],
    accessPolicies: demoBundle.accessPolicies.map((p) => ({ ...p, hoursFreshness: "verified" as const, feeFreshness: "verified" as const })),
    missions,
  });
  const live = { allowDemo: false, nowIso: "2026-11-19T10:00:00+09:00" };

  it("미검수 미션이 앞에 있어도 검수된 미션이 선택된다", () => {
    const r = generateMystery(baseReq(), liveBundle([clone("a-unreviewed", "bread", false), clone("b-reviewed", "bread", true)]), live);
    expect(r.status).toBe("ok");
    if (r.status === "ok") expect(r.mission.id).toBe("b-reviewed");
  });
  it("검수된 미션이 하나도 없으면 장소가 제외된다", () => {
    const r = generateMystery(baseReq(), liveBundle([clone("a", "bread", false)]), live);
    expect(r.status).toBe("none");
    expect(r.candidates[0]!.exclusions).toContain("mission-not-reviewed");
  });
  it("테마는 mission.themeId로 판정한다(같은 장소의 다른 테마 미션은 선택되지 않음)", () => {
    const b = liveBundle([clone("a-food", "food", true), clone("b-bread", "bread", true)]);
    for (let i = 0; i < 10; i++) {
      const r = generateMystery(baseReq({ themeIds: ["bread"], randomSeed: `t${i}` }), b, live);
      expect(r.status === "ok" && r.mission.id).toBe("b-bread");
    }
    expect(generateMystery(baseReq({ themeIds: ["heritage"] }), b, live).status).toBe("none");
  });
  it("쓸 수 있는 미션이 여럿이면 시드로 재현 가능하게 고른다", () => {
    const b = liveBundle([clone("a", "bread", true), clone("b", "bread", true)]);
    const ids = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const r = generateMystery(baseReq({ randomSeed: `x${i}` }), b, live);
      if (r.status === "ok") ids.add(r.mission.id);
      const again = generateMystery(baseReq({ randomSeed: `x${i}` }), b, live);
      expect(JSON.stringify(r)).toBe(JSON.stringify(again));
    }
    expect(ids.size).toBe(2);
  });
});

describe("데모 콘텐츠 15개", () => {
  it("장소 15곳·미션 15개, 장소마다 미션과 힌트가 있다", () => {
    expect(demoBundle.places).toHaveLength(15);
    expect(demoBundle.missions).toHaveLength(15);
    for (const p of demoBundle.places) {
      expect(demoBundle.missions.filter((m) => m.placeId === p.id), p.id).toHaveLength(1);
      expect(p.extraHint, p.id).toBeTruthy();
    }
  });
  it("낮 시간 15분 코스에서 여러 장소가 골고루 선택된다", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const r = generateMystery(baseReq({ randomSeed: `v${i}` }), demoBundle, demoOpts);
      expect(r.status).toBe("ok");
      if (r.status === "ok") seen.add(r.place.id);
    }
    expect(seen.size).toBeGreaterThanOrEqual(7); // 낮 10:00 적격 후보 10곳 중 상위 8곳 안에서 고른다
    expect(seen.has("demo-far-008")).toBe(false); // 도보 시간을 모르는 먼 곳은 제외
    expect(seen.has("demo-museum-007")).toBe(false); // 예약제는 "예약 없음" 조건에서 제외
  });
  it("테마마다 낮에 선택 가능한 장소가 있다", () => {
    for (const t of ["bread", "food", "heritage", "walk"]) {
      const places = new Set<string>();
      for (let i = 0; i < 60; i++) {
        const r = generateMystery(baseReq({ themeIds: [t], randomSeed: `${t}${i}` }), demoBundle, demoOpts);
        if (r.status === "ok") {
          expect(r.mission.themeId).toBe(t);
          places.add(r.place.id);
        }
      }
      // 문화유산은 낮 15분 코스에서 야외 우물터 1곳뿐(고궁형은 도보 7분이라 시간 초과)
      expect(places.size, t).toBeGreaterThanOrEqual(t === "heritage" ? 1 : 2);
    }
  });
  it("저녁 이후에는 야외 장소가 빠지고 심야 식당류가 나온다", () => {
    const at = "2026-11-19T21:30:00+09:00";
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const r = generateMystery(baseReq({ randomSeed: `n${i}`, localDateTime: at }), demoBundle, { allowDemo: true, nowIso: at });
      if (r.status === "ok") ids.add(r.place.id);
    }
    expect([...ids].every((id) => id === "demo-bar-004" || id === "demo-restaurant-012")).toBe(true);
  });
});

describe("자정을 넘기는 구간: 요일·월 경계", () => {
  const mk = (over: Record<string, unknown>) => ({
    ...lateNight, hoursFreshness: "verified" as const, feeFreshness: "verified" as const, closedDays: [] as number[], exceptions: [],
    windows: [{ days: [0, 1, 2, 3, 4, 5, 6], open: "22:00", close: "02:00", lastEntryMinutesBeforeClose: 0, mode: "free-roam" as const }],
    ...over,
  });
  const at = (policy: ReturnType<typeof mk>, iso: string) => evaluateAccess(policy, q(iso, { allowUnverified: false, stayMinutes: 3 }));

  it("12월 한정 22:00~02:00 구간은 1월 1일 01:00에도 이어진다", () => {
    const p = mk({ windows: [{ days: [0, 1, 2, 3, 4, 5, 6], open: "22:00", close: "02:00", lastEntryMinutesBeforeClose: 0, mode: "free-roam" as const, months: [12] }] });
    expect(at(p, "2026-12-31T23:00:00+09:00").eligibility).toBe("eligible");
    expect(at(p, "2027-01-01T01:00:00+09:00").eligibility).toBe("eligible");
    expect(at(p, "2027-01-01T23:00:00+09:00").eligibility).toBe("ineligible"); // 1월 저녁은 12월 한정 구간 밖
  });
  it("1월 한정 구간은 12월 31일 시작분의 새벽을 열지 않는다", () => {
    const p = mk({ windows: [{ days: [0, 1, 2, 3, 4, 5, 6], open: "22:00", close: "02:00", lastEntryMinutesBeforeClose: 0, mode: "free-roam" as const, months: [1] }] });
    expect(at(p, "2027-01-01T01:00:00+09:00").eligibility).toBe("ineligible");
    expect(at(p, "2027-01-01T23:00:00+09:00").eligibility).toBe("eligible");
  });
  it("월요일 휴관인 곳도 일요일 밤에 시작한 영업은 월요일 새벽까지 이어진다", () => {
    const p = mk({ closedDays: [1] });
    expect(at(p, "2026-11-23T01:00:00+09:00").eligibility).toBe("eligible"); // 11-23 월요일 새벽(전날 일요일 시작)
    expect(at(p, "2026-11-23T23:00:00+09:00").eligibility).toBe("ineligible"); // 월요일 저녁은 휴관
  });
  it("전날(시작일)이 휴관일이면 그 구간의 새벽도 닫힌다", () => {
    const p = mk({ closedDays: [0] }); // 일요일 휴관
    expect(at(p, "2026-11-23T01:00:00+09:00").eligibility).toBe("ineligible"); // 월요일 새벽(일요일 시작 구간)
  });
});

describe("엔진: 비활성 테마·미션 순서", () => {
  const base = demoBundle;
  it("비활성 테마의 미션은 테마를 지정하지 않아도 선택되지 않는다", () => {
    const b = { ...base, themes: base.themes.map((t) => (t.id === "food" ? { ...t, active: false } : t)) };
    for (let i = 0; i < 80; i++) {
      const r = generateMystery(baseReq({ randomSeed: `i${i}` }), b, demoOpts);
      if (r.status === "ok") expect(r.mission.themeId).not.toBe("food");
    }
  });
  it("미션 배열 순서가 바뀌어도 같은 시드는 같은 미션을 고른다", () => {
    const m0 = base.missions.find((m) => m.placeId === "demo-bakery-001")!;
    const extra = { ...m0, id: "m-demo-bakery-001-b" };
    const only = (ms: typeof base.missions) => ({ ...base, places: base.places.filter((p) => p.id === "demo-bakery-001"), missions: ms });
    for (let i = 0; i < 20; i++) {
      const a = generateMystery(baseReq({ randomSeed: `o${i}` }), only([m0, extra]), demoOpts);
      const b = generateMystery(baseReq({ randomSeed: `o${i}` }), only([extra, m0]), demoOpts);
      expect(a.status === "ok" && b.status === "ok" && a.mission.id === b.mission.id).toBe(true);
    }
  });
});
