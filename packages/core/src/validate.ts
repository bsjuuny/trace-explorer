import { ContentBundle } from "@trace/schemas";

export type Issue = { level: "error" | "warn"; path: string; message: string };

export type ValidateOptions = {
  /** public=true면 공개 번들 기준(데모·미검증·금지 필드 불가)으로 검사 */
  public: boolean;
  /** 만료 판정 기준 시각(ISO). 기본은 현재 시각 */
  nowIso?: string;
};

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
  for (const m of b.missions) {
    const at = `missions.${m.id}`;
    if (!placeIds.has(m.placeId)) err(at, `없는 장소: ${m.placeId}`);
    if (!themeIds.has(m.themeId)) err(at, `없는 테마: ${m.themeId}`);
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
