import type { AccessPolicy, Eligibility, Exception, OpeningWindow } from "@trace/schemas";
import { hhmmToMinutes, toSeoul } from "./time";

export type AccessQuery = {
  /** 사용자가 장소에 도착하는 시각 (ISO) */
  arrivalIso: string;
  maxAdmissionFeeKrw: number;
  requireNoReservation: boolean;
  stayMinutes: number;
  /** 데모 모드: 미검증 시간표·요금을 통과시킨다(공개 서비스에서는 항상 false). */
  allowUnverified?: boolean;
};

export type AccessResult = { eligibility: Eligibility; reasons: string[]; feeKrw: number | null };

export function evaluateAccess(policy: AccessPolicy, q: AccessQuery): AccessResult {
  const t = toSeoul(q.arrivalIso);
  const reasons: string[] = [];

  // 특별 휴관은 최우선. 특별 개방은 해당 기간의 정기 휴관·운영시간을 대체한다.
  for (const ex of policy.exceptions) {
    if (ex.kind === "closed" && t.date >= ex.from && t.date <= ex.to) {
      return { eligibility: "ineligible", reasons: ["exception-closed"], feeKrw: null };
    }
  }
  const special = findSpecialOpen(policy.exceptions, t.date, t.minutes);
  // 전날 시작해 자정을 넘기는 구간은 전날의 요일·월로 판정한다(월 경계·휴관일 모두).
  const prevDate = new Date(Date.parse(`${t.date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const prevMonth = Number(prevDate.slice(5, 7));
  const prevDow = (t.dow + 6) % 7;
  const regular = special ? null : findWindow(policy, t.dow, t.month, prevMonth, t.minutes);

  // 전날 시작해 자정을 넘긴 구간은 시작일(전날)의 요일 요금을 적용한다.
  const fee = special?.fee ?? resolveFee(policy, regular?.fromPreviousDay ? prevDow : t.dow);

  if (policy.publicOutdoor) {
    // 외부 공공구역: 시간표 없이 가능. 요금은 0으로 취급.
    return { eligibility: "eligible", reasons: [], feeKrw: 0 };
  }

  // 오늘이 휴관일이어도 전날부터 이어지는 영업(자정 이후)이면 영업 중이다. 그 구간은 시작일의 휴관 여부로 판정한다.
  const continuesFromPrev = !!regular?.fromPreviousDay;
  if (!special?.coversDate && !continuesFromPrev && policy.closedDays.includes(t.dow)) {
    return { eligibility: "ineligible", reasons: ["closed-day"], feeKrw: fee };
  }
  if (continuesFromPrev && policy.closedDays.includes(prevDow)) {
    return { eligibility: "ineligible", reasons: ["closed-day"], feeKrw: fee };
  }

  if (policy.hoursFreshness !== "verified" && !q.allowUnverified) {
    return { eligibility: "unknown", reasons: [...reasons, `hours-${policy.hoursFreshness}`], feeKrw: fee };
  }

  const win = special ? special.win : regular;
  if (!win) return { eligibility: "ineligible", reasons: [...reasons, "outside-hours"], feeKrw: fee };

  const closeMin = hhmmToMinutes(win.window.close);
  const openMin = hhmmToMinutes(win.window.open);
  const crosses = closeMin <= openMin;
  // 자정 이후(전날 시작 구간)면 close까지 남은 분, 아니면 close(+24h)까지
  const minutesUntilClose = win.fromPreviousDay
    ? closeMin - t.minutes
    : (crosses ? closeMin + 1440 : closeMin) - t.minutes;
  const lastEntry = win.window.lastEntryMinutesBeforeClose;
  if (minutesUntilClose - lastEntry < 0) {
    return { eligibility: "ineligible", reasons: [...reasons, "last-entry-passed"], feeKrw: fee };
  }
  if (minutesUntilClose < q.stayMinutes) {
    return { eligibility: "ineligible", reasons: [...reasons, "not-enough-time-before-close"], feeKrw: fee };
  }

  if (win.window.mode === "reservation-required") {
    if (q.requireNoReservation) return { eligibility: "ineligible", reasons: [...reasons, "reservation-required"], feeKrw: fee };
    return { eligibility: "unknown", reasons: [...reasons, "reservation-unconfirmed"], feeKrw: fee };
  }
  if (win.window.mode === "guided") {
    return { eligibility: "ineligible", reasons: [...reasons, "guided-only"], feeKrw: fee };
  }
  if (win.window.mode === "timed") {
    return { eligibility: "unknown", reasons: [...reasons, "timed-entry-slot-unconfirmed"], feeKrw: fee };
  }
  if (win.window.mode === "unknown") {
    return { eligibility: "unknown", reasons: [...reasons, "access-mode-unknown"], feeKrw: fee };
  }

  if (fee === null) return { eligibility: "unknown", reasons: [...reasons, "fee-unknown"], feeKrw: null };
  if (fee > q.maxAdmissionFeeKrw) {
    return { eligibility: "ineligible", reasons: [...reasons, "fee-exceeds-limit"], feeKrw: fee };
  }
  if (policy.feeFreshness !== "verified" && fee > 0 && !q.allowUnverified) {
    return { eligibility: "unknown", reasons: [...reasons, `fee-${policy.feeFreshness}`], feeKrw: fee };
  }
  if (reasons.length) return { eligibility: "unknown", reasons, feeKrw: fee };
  return { eligibility: "eligible", reasons: [], feeKrw: fee };
}

/**
 * 도착 시각이 특별 개방 기간에 속하는지 판정한다. 기간 안이면 그 예외의 시간만 쓰고(시간 밖이면 win=null),
 * 자정을 넘기는 구간은 전날이 기간에 속할 때 자정 이후 도착도 같은 구간으로 본다.
 */
function findSpecialOpen(
  exceptions: Exception[],
  date: string,
  minutes: number,
): { win: { window: OpeningWindow; fromPreviousDay: boolean } | null; fee: number | null; coversDate: boolean } | null {
  const prevDate = new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const toWindow = (e: Exception): OpeningWindow => ({
    days: [0, 1, 2, 3, 4, 5, 6],
    open: e.open!,
    close: e.close!,
    lastEntryMinutesBeforeClose: e.lastEntryMinutesBeforeClose,
    mode: e.mode!,
  });
  let covered: Exception | null = null;
  for (const e of exceptions) {
    if (e.kind !== "special-open" || !e.open || !e.close || !e.mode) continue;
    const o = hhmmToMinutes(e.open);
    const c = hhmmToMinutes(e.close);
    const crosses = c <= o;
    const today = date >= e.from && date <= e.to;
    if (today && minutes >= o && (crosses || minutes < c)) return { win: { window: toWindow(e), fromPreviousDay: false }, fee: e.feeKrw ?? null, coversDate: true };
    if (crosses && prevDate >= e.from && prevDate <= e.to && minutes < c) return { win: { window: toWindow(e), fromPreviousDay: true }, fee: e.feeKrw ?? null, coversDate: true };
    if (today && !covered) covered = e;
  }
  // 기간 안이지만 개방 시간 밖
  return covered ? { win: null, fee: covered.feeKrw ?? null, coversDate: true } : null;
}

function resolveFee(policy: AccessPolicy, dow: number): number | null {
  // 요일 한정 규칙이 일반 규칙보다 우선
  const specific = policy.fees.find((f) => f.days?.includes(dow));
  if (specific) return specific.feeKrw;
  const general = policy.fees.find((f) => !f.days);
  return general ? general.feeKrw : null;
}

function findWindow(policy: AccessPolicy, dow: number, month: number, prevMonth: number, minutes: number) {
  const inMonth = (w: { months?: number[] | undefined }, m: number) => !w.months || w.months.includes(m);
  for (const w of policy.windows) {
    const o = hhmmToMinutes(w.open);
    const c = hhmmToMinutes(w.close);
    const crosses = c <= o;
    if (inMonth(w, month) && w.days.includes(dow) && minutes >= o && (crosses || minutes < c)) return { window: w, fromPreviousDay: false };
    // 전날 시작 구간은 시작일(전날)의 월로 적용 여부를 판정한다(12/31 밤 → 1/1 새벽).
    const prev = (dow + 6) % 7;
    if (crosses && inMonth(w, prevMonth) && w.days.includes(prev) && minutes < c) return { window: w, fromPreviousDay: true };
  }
  return null;
}
