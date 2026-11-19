import { ContentBundle, type OpeningWindow } from "@trace/schemas";
import { hhmmToMinutes } from "./time";

export type Issue = { level: "error" | "warn"; path: string; message: string };

export type ValidateOptions = {
  /** public=true면 공개 번들 기준(데모·미검증·금지 필드 불가)으로 검사 */
  public: boolean;
  /** 만료 판정 기준 시각(ISO). 기본은 현재 시각 */
  nowIso?: string;
};

const span = (w: { open: string; close: string }): [number, number] => {
  const o = hhmmToMinutes(w.open);
  const c = hhmmToMinutes(w.close);
  return [o, c <= o ? c + 1440 : c];
};

/** 두 운영시간이 같은 요일·월에서 시간이 겹치는지(자정 넘김 포함). 우선순위 없이 겹치면 배열 순서에 결과가 달라진다. */
function windowsOverlap(a: OpeningWindow, b: OpeningWindow): boolean {
  const [ao, ac] = span(a);
  const [bo, bc] = span(b);
  const sameMonth = !a.months || !b.months || a.months.some((m) => b.months!.includes(m));
  if (sameMonth && a.days.some((d) => b.days.includes(d)) && ao < bc && bo < ac) return true;
  // 한쪽이 자정을 넘기면 다음 날 이른 시간대가 다른 쪽 시작과 겹칠 수 있다.
  // 꼬리는 다음 날 새벽이므로 달이 바뀔 수 있다(12월 → 1월). y가 x의 시작 월 또는 그 다음 달에 적용되면 겹침 후보다.
  const monthsTouch = (x: OpeningWindow, y: OpeningWindow) =>
    !x.months || !y.months || x.months.some((m) => y.months!.includes(m) || y.months!.includes((m % 12) + 1));
  const tail = (x: OpeningWindow, y: OpeningWindow) => {
    const [xo, xc] = span(x);
    const [yo] = span(y);
    return xc > 1440 && monthsTouch(x, y) && x.days.some((d) => y.days.includes((d + 1) % 7)) && yo < xc - 1440 && yo >= 0 && xo >= 0;
  };
  return tail(a, b) || tail(b, a);
}

function dupes(ids: string[]): string[] {
  const seen = new Set<string>();
  const d = new Set<string>();
  for (const id of ids) (seen.has(id) ? d : seen).add(id);
  return [...d];
}

export function validateBundle(raw: unknown, opts: ValidateOptions): { issues: Issue[]; bundle: ContentBundle | null } {
  const issues: Issue[] = [];
  const parsed = ContentBundle.safeParse(raw);
  if (!parsed.success) {
    for (const i of parsed.error.issues) issues.push({ level: "error", path: i.path.join("."), message: i.message });
    return { issues, bundle: null };
  }
  const b = parsed.data;
  const err = (path: string, message: string) => issues.push({ level: "error", path, message });
  const warn = (path: string, message: string) => issues.push({ level: "warn", path, message });

  const groups: Array<[string, string[]]> = [
    ["places", b.places.map((p) => p.id)],
    ["missions", b.missions.map((m) => m.id)],
    ["themes", b.themes.map((t) => t.id)],
    ["rewards", b.rewards.map((r) => r.id)],
    ["accessPolicies", b.accessPolicies.map((p) => p.id)],
  ];
  for (const [name, ids] of groups) {
    for (const d of dupes(ids)) err(name, `중복 ID: ${d}`);
  }

  const placeIds = new Set(b.places.map((p) => p.id));
  const themeIds = new Set(b.themes.map((t) => t.id));
  const rewardIds = new Set(b.rewards.map((r) => r.id));
  const policyIds = new Set(b.accessPolicies.map((p) => p.id));

  for (const p of b.places) {
    const at = `places.${p.id}`;
    if (p.coordinates.lat === null || p.coordinates.lng === null) {
      if (p.publication.status !== "draft") err(at, "공개/검증 상태 장소에 좌표가 없음");
      else warn(at, "좌표 없음(draft)");
    }
    if (!policyIds.has(p.accessPolicyId)) err(at, `없는 접근 정책: ${p.accessPolicyId}`);
  }
  for (const pol of b.accessPolicies) {
    const at = `accessPolicies.${pol.id}`;
    for (let i = 0; i < pol.windows.length; i++) {
      for (let j = i + 1; j < pol.windows.length; j++) {
        if (windowsOverlap(pol.windows[i]!, pol.windows[j]!)) err(at, `운영시간 ${i + 1}·${j + 1}번이 겹침(배열 순서에 따라 결과가 달라짐)`);
      }
    }
    const generalFees = pol.fees.filter((f) => !f.days).length;
    if (generalFees > 1) err(at, "일반 요금 규칙이 둘 이상");
    for (let i = 0; i < pol.fees.length; i++) {
      for (let j = i + 1; j < pol.fees.length; j++) {
        const a = pol.fees[i]!.days;
        const c = pol.fees[j]!.days;
        if (a && c && a.some((d) => c.includes(d))) err(at, `요일 한정 요금 ${i + 1}·${j + 1}번이 겹침`);
      }
    }
    const sp = pol.exceptions.filter((e) => e.kind === "special-open");
    for (let i = 0; i < sp.length; i++) {
      for (let j = i + 1; j < sp.length; j++) {
        if (sp[i]!.from <= sp[j]!.to && sp[j]!.from <= sp[i]!.to) err(at, "특별 개방 기간이 서로 겹침");
      }
    }
  }
  const themeById = new Map(b.themes.map((t) => [t.id, t]));
  const placeById = new Map(b.places.map((p) => [p.id, p]));
  for (const m of b.missions) {
    const at = `missions.${m.id}`;
    if (!placeIds.has(m.placeId)) err(at, `없는 장소: ${m.placeId}`);
    if (!themeIds.has(m.themeId)) err(at, `없는 테마: ${m.themeId}`);
    else {
      const pl = placeById.get(m.placeId);
      const th = themeById.get(m.themeId)!;
      if (pl && th.categories.length > 0 && !pl.categories.some((c) => th.categories.includes(c))) {
        warn(at, `테마 ${m.themeId}의 분류와 장소 분류가 겹치지 않음`);
      }
    }
    if (!rewardIds.has(m.rewardId)) err(at, `없는 보상: ${m.rewardId}`);
    const orders = m.clues.map((c) => c.order).sort().join(",");
    if (orders !== "1,2,3") err(at, "단서 순서는 1,2,3이어야 함");
    if (m.clues.some((c) => c.text.trim() === "")) err(at, "빈 단서 문구");
  }

  if (opts.public) {
    const now = Date.parse(opts.nowIso ?? new Date().toISOString());
    if (Date.parse(b.expiresAt) <= now) err("expiresAt", "번들이 이미 만료됨");
    for (const p of b.places) {
      const at = `places.${p.id}`;
      if (p.publication.isDemo) err(at, "공개 번들에 데모 장소 포함 불가");
      if (p.publication.status !== "published") err(at, "공개 번들은 published 상태만 허용");
      if (p.freshness !== "verified") err(at, `공개 장소의 신선도는 verified여야 함(현재 ${p.freshness})`);
      if (!p.source.lastCheckedAt || !p.source.expiresAt) err(at, "확인일·만료일 필수");
      if (!p.source.license) err(at, "라이선스/권리 정보 필수");
      if (p.adminNote !== undefined) err(at, "금지 필드 포함: adminNote");
      if (!p.extraHint) warn(at, "추가 힌트 없음(분류·도보 시간만 보여줌)");
      else if (p.name && p.extraHint.includes(p.name)) err(at, "추가 힌트에 장소 이름이 포함됨");
    }
    const policyById = new Map(b.accessPolicies.map((x) => [x.id, x]));
    const placesWithMission = new Set(b.missions.map((m) => m.placeId));
    for (const p of b.places) {
      const at = `places.${p.id}`;
      if (!placesWithMission.has(p.id)) err(at, "공개 장소에 미션이 없음");
      const pol = policyById.get(p.accessPolicyId);
      if (pol) {
        if (!pol.publicOutdoor && pol.hoursFreshness !== "verified") err(`accessPolicies.${pol.id}`, `공개 장소의 운영시간 신선도는 verified여야 함(현재 ${pol.hoursFreshness})`);
        const paid = pol.fees.some((f) => f.feeKrw > 0) || pol.exceptions.some((e) => (e.feeKrw ?? 0) > 0);
        if (paid && pol.feeFreshness !== "verified") err(`accessPolicies.${pol.id}`, `유료 요금의 신선도는 verified여야 함(현재 ${pol.feeFreshness})`);
      }
    }
    for (const m of b.missions) {
      if (!m.reviewed || !m.safetyReviewed || m.clues.some((c) => !c.reviewed)) {
        err(`missions.${m.id}`, "미검수 미션은 공개 불가");
      }
    }
  }
  return { issues, bundle: b };
}

/** 공개 필드 allowlist 적용: 관리자 메모·검증자 식별 정보 제거 */
export function toPublicBundle(b: ContentBundle): ContentBundle {
  return {
    ...b,
    places: b.places.map((p) => {
      const { adminNote: _adminNote, ...rest } = p;
      return { ...rest, source: { ...rest.source, verifiedBy: null } };
    }),
  };
}

export function summarizeDiff(prev: ContentBundle | null, next: ContentBundle): string[] {
  const lines: string[] = [];
  const diffSet = <T extends { id: string }>(name: string, a: T[], c: T[]) => {
    const am = new Map(a.map((x) => [x.id, JSON.stringify(x)]));
    const cm = new Map(c.map((x) => [x.id, JSON.stringify(x)]));
    const added = [...cm.keys()].filter((k) => !am.has(k));
    const removed = [...am.keys()].filter((k) => !cm.has(k));
    const changed = [...cm.keys()].filter((k) => am.has(k) && am.get(k) !== cm.get(k));
    lines.push(`${name}: +${added.length} -${removed.length} ~${changed.length}`);
  };
  lines.push(`contentVersion: ${prev?.contentVersion ?? "(없음)"} -> ${next.contentVersion}`);
  diffSet("places", prev?.places ?? [], next.places);
  diffSet("missions", prev?.missions ?? [], next.missions);
  diffSet("themes", prev?.themes ?? [], next.themes);
  diffSet("rewards", prev?.rewards ?? [], next.rewards);
  diffSet("accessPolicies", prev?.accessPolicies ?? [], next.accessPolicies);
  return lines;
}
