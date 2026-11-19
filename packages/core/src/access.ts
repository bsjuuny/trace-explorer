import type { AccessPolicy, Eligibility } from "@trace/schemas";
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

  // 특별 휴관/개방 예외는 최우선
  for (const ex of policy.exceptions) {
    if (t.date >= ex.from && t.date <= ex.to) {
      if (ex.kind === "closed") return { eligibility: "ineligible", reasons: ["exception-closed"], feeKrw: null };
      reasons.push("special-open-unverified");
    }
  }

  const fee = resolveFee(policy, t.dow);

  if (policy.publicOutdoor) {
    // 외부 공공구역: 시간표 없이 가능. 요금은 0으로 취급.
    return reasons.length
      ? { eligibility: "unknown", reasons, feeKrw: 0 }
      : { eligibility: "eligible", reasons: [], feeKrw: 0 };
  }

  if (policy.closedDays.includes(t.dow)) {
    return { eligibility: "ineligible", reasons: ["closed-day"], feeKrw: fee };
  }

  if (policy.hoursFreshness !== "verified" && !q.allowUnverified) {
    return { eligibility: "unknown", reasons: [...reasons, `hours-${policy.hoursFreshness}`], feeKrw: fee };
  }

  const win = findWindow(policy, t.dow, t.month, t.minutes);
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

function resolveFee(policy: AccessPolicy, dow: number): number | null {
  // 요일 한정 규칙이 일반 규칙보다 우선
  const specific = policy.fees.find((f) => f.days?.includes(dow));
  if (specific) return specific.feeKrw;
  const general = policy.fees.find((f) => !f.days);
  return general ? general.feeKrw : null;
}

function findWindow(policy: AccessPolicy, dow: number, month: number, minutes: number) {
  const inMonth = (w: { months?: number[] | undefined }) => !w.months || w.months.includes(month);
  for (const w of policy.windows) {
    if (!inMonth(w)) continue;
    const o = hhmmToMinutes(w.open);
    const c = hhmmToMinutes(w.close);
    const crosses = c <= o;
    if (w.days.includes(dow) && minutes >= o && (crosses || minutes < c)) return { window: w, fromPreviousDay: false };
    const prev = (dow + 6) % 7;
    if (crosses && w.days.includes(prev) && minutes < c) return { window: w, fromPreviousDay: true };
  }
  return null;
}
