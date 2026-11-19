import { useState } from "react";
import { newAccessPolicy, newMission, newReward, newTheme } from "@trace/templates";
import { AccessPolicy, Mission, Reward, Theme, type ContentBundle, type Place } from "@trace/schemas";
import type { ZodType } from "zod";

type Props = { bundle: ContentBundle; setBundle: (b: ContentBundle) => void };

const csv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));

export function PlacesTab({ bundle, setBundle }: Props) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [selId, setSelId] = useState<string | null>(null);
  const places = bundle.places.filter(
    (p) => (!q || (p.name + p.id + p.tags.join(",")).toLowerCase().includes(q.toLowerCase())) && (!status || p.publication.status === status),
  );
  const sel = bundle.places.find((p) => p.id === selId) ?? null;

  const update = (id: string, patch: (p: Place) => Place) =>
    setBundle({ ...bundle, places: bundle.places.map((p) => (p.id === id ? patch(p) : p)) });

  const add = () => {
    const id = `new-place-${bundle.places.length + 1}`;
    const p: Place = {
      schemaVersion: 1, contentVersion: bundle.contentVersion, id, name: "[데모] 새 장소",
      coordinates: { lat: null, lng: null }, categories: ["cafe"], tags: [],
      source: { type: "manual", sourceId: null, sourceUrl: null, license: null, attribution: null, verificationMethod: null, verifiedBy: null, lastCheckedAt: null, expiresAt: null },
      freshness: "unknown", publication: { status: "draft", isDemo: true },
      accessPolicyId: bundle.accessPolicies[0]?.id ?? "", checkInPolicy: { radiusMeters: 60, maxAccuracyMeters: 80 },
      missionTemplateIds: [], walkEstimate: null,
    };
    setBundle({ ...bundle, places: [...bundle.places, p] });
    setSelId(id);
  };

  return (
    <div className="grid2">
      <div>
        <div className="row">
          <input placeholder="검색(이름·ID·태그)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="장소 검색" />
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="상태 필터">
            <option value="">전체 상태</option><option value="draft">draft</option><option value="validated">validated</option><option value="published">published</option>
          </select>
          <button className="btn" onClick={add}>장소 추가</button>
        </div>
        <table>
          <thead><tr><th>ID</th><th>이름</th><th>상태</th><th>신선도</th></tr></thead>
          <tbody>
            {places.map((p) => (
              <tr key={p.id} className={p.id === selId ? "sel" : ""} onClick={() => setSelId(p.id)} style={{ cursor: "pointer" }}>
                <td>{p.id}</td><td>{p.name}</td><td>{p.publication.status}{p.publication.isDemo ? " (데모)" : ""}</td><td>{p.freshness}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        {!sel ? <p>왼쪽에서 장소를 선택하세요.</p> : (
          <div>
            <h3>{sel.id}</h3>
            <F label="이름"><input value={sel.name} onChange={(e) => update(sel.id, (p) => ({ ...p, name: e.target.value }))} /></F>
            <div className="row">
              <F label="위도"><input value={sel.coordinates.lat ?? ""} onChange={(e) => update(sel.id, (p) => ({ ...p, coordinates: { ...p.coordinates, lat: numOrNull(e.target.value) } }))} /></F>
              <F label="경도"><input value={sel.coordinates.lng ?? ""} onChange={(e) => update(sel.id, (p) => ({ ...p, coordinates: { ...p.coordinates, lng: numOrNull(e.target.value) } }))} /></F>
              {sel.coordinates.lat !== null && sel.coordinates.lng !== null && (
                <a href={`https://map.kakao.com/link/map/${encodeURIComponent(sel.name)},${sel.coordinates.lat},${sel.coordinates.lng}`} target="_blank" rel="noopener noreferrer">지도에서 좌표 확인</a>
              )}
            </div>
            <F label="분류(쉼표)"><input value={sel.categories.join(",")} onChange={(e) => update(sel.id, (p) => ({ ...p, categories: csv(e.target.value) }))} /></F>
            <F label="태그(쉼표)"><input value={sel.tags.join(",")} onChange={(e) => update(sel.id, (p) => ({ ...p, tags: csv(e.target.value) }))} /></F>
            <div className="row">
              <F label="공개 상태">
                <select value={sel.publication.status} onChange={(e) => update(sel.id, (p) => ({ ...p, publication: { ...p.publication, status: e.target.value as Place["publication"]["status"] } }))}>
                  <option>draft</option><option>validated</option><option>published</option>
                </select>
              </F>
              <F label="데모 장소">
                <input type="checkbox" checked={sel.publication.isDemo} onChange={(e) => update(sel.id, (p) => ({ ...p, publication: { ...p.publication, isDemo: e.target.checked } }))} />
              </F>
              <F label="신선도">
                <select value={sel.freshness} onChange={(e) => update(sel.id, (p) => ({ ...p, freshness: e.target.value as Place["freshness"] }))}>
                  <option>verified</option><option>stale</option><option>unknown</option><option>conflicting</option>
                </select>
              </F>
            </div>
            <F label="접근 정책">
              <select value={sel.accessPolicyId} onChange={(e) => update(sel.id, (p) => ({ ...p, accessPolicyId: e.target.value }))}>
                {bundle.accessPolicies.map((a) => <option key={a.id}>{a.id}</option>)}
              </select>
            </F>
            <div className="row">
              <F label="체크인 반경(m)"><input type="number" value={sel.checkInPolicy.radiusMeters} onChange={(e) => update(sel.id, (p) => ({ ...p, checkInPolicy: { ...p.checkInPolicy, radiusMeters: Number(e.target.value) } }))} /></F>
              <F label="최대 정확도(m)"><input type="number" value={sel.checkInPolicy.maxAccuracyMeters} onChange={(e) => update(sel.id, (p) => ({ ...p, checkInPolicy: { ...p.checkInPolicy, maxAccuracyMeters: Number(e.target.value) } }))} /></F>
            </div>
            <h4>출처·검증</h4>
            <F label="출처 URL"><input value={sel.source.sourceUrl ?? ""} onChange={(e) => update(sel.id, (p) => ({ ...p, source: { ...p.source, sourceUrl: e.target.value || null } }))} /></F>
            <F label="라이선스/권리"><input value={sel.source.license ?? ""} onChange={(e) => update(sel.id, (p) => ({ ...p, source: { ...p.source, license: e.target.value || null } }))} /></F>
            <div className="row">
              <F label="최종 확인일(ISO)"><input value={sel.source.lastCheckedAt ?? ""} onChange={(e) => update(sel.id, (p) => ({ ...p, source: { ...p.source, lastCheckedAt: e.target.value || null } }))} /></F>
              <F label="만료일(ISO)"><input value={sel.source.expiresAt ?? ""} onChange={(e) => update(sel.id, (p) => ({ ...p, source: { ...p.source, expiresAt: e.target.value || null } }))} /></F>
            </div>
            <F label="관리자 메모(공개 번들에서 제외됨)"><input value={sel.adminNote ?? ""} onChange={(e) => update(sel.id, (p) => ({ ...p, adminNote: e.target.value }))} /></F>
            <button className="btn danger" onClick={() => { setBundle({ ...bundle, places: bundle.places.filter((p) => p.id !== sel.id) }); setSelId(null); }}>이 장소 삭제</button>
          </div>
        )}
      </div>
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

type Kind = "themes" | "rewards" | "accessPolicies" | "missions";
const SCHEMAS: Record<Kind, { schema: ZodType; make: () => { id: string } }> = {
  themes: { schema: Theme, make: newTheme },
  rewards: { schema: Reward, make: newReward },
  accessPolicies: { schema: AccessPolicy, make: newAccessPolicy },
  missions: { schema: Mission, make: () => newMission() },
};
const KIND_LABEL: Record<Kind, string> = { themes: "테마", rewards: "보상", accessPolicies: "접근 정책", missions: "미션(단서 포함)" };

export function TemplatesTab({ bundle, setBundle }: Props) {
  const [kind, setKind] = useState<Kind>("themes");
  const [selId, setSelId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const items = bundle[kind] as Array<{ id: string }>;

  const select = (id: string) => {
    setSelId(id);
    setText(JSON.stringify(items.find((i) => i.id === id), null, 2));
    setMsg("");
  };
  const save = () => {
    const r = SCHEMAS[kind].schema.safeParse(JSON.parse(safe(text)));
    if (!r.success) return setMsg(r.error.issues.slice(0, 3).map((i) => `${i.path.join(".")} ${i.message}`).join(" / "));
    const v = r.data as { id: string };
    if (!v.id) return setMsg("id가 비어 있습니다.");
    const exists = items.some((i) => i.id === selId);
    const next = exists ? items.map((i) => (i.id === selId ? v : i)) : [...items, v];
    if (new Set(next.map((i) => i.id)).size !== next.length) return setMsg("중복 ID입니다.");
    setBundle({ ...bundle, [kind]: next });
    setSelId(v.id);
    setMsg("저장됨(내보내기 전까지 이 화면 메모리에만 있습니다)");
  };

  return (
    <div>
      <div className="row">
        {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
          <button key={k} className={`btn ${k === kind ? "" : "sub"}`} onClick={() => { setKind(k); setSelId(null); setText(""); setMsg(""); }}>{KIND_LABEL[k]}</button>
        ))}
      </div>
      <div className="grid2">
        <div>
          <button className="btn" onClick={() => { setSelId(null); setText(JSON.stringify(SCHEMAS[kind].make(), null, 2)); setMsg("새 항목: id를 채우고 저장하세요"); }}>새 항목(템플릿)</button>
          <table>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className={i.id === selId ? "sel" : ""} onClick={() => select(i.id)} style={{ cursor: "pointer" }}><td>{i.id}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <textarea className="json" value={text} onChange={(e) => setText(e.target.value)} aria-label="JSON 편집" />
          <div className="row">
            <button className="btn" onClick={save} disabled={!text}>저장(스키마 검증)</button>
            <button className="btn sub" disabled={!selId} onClick={() => {
              const dup = { ...JSON.parse(safe(text)), id: `${selId}-copy` };
              setSelId(null); setText(JSON.stringify(dup, null, 2)); setMsg("복제본: 저장하면 추가됩니다");
            }}>복제</button>
            <button className="btn danger" disabled={!selId} onClick={() => { setBundle({ ...bundle, [kind]: items.filter((i) => i.id !== selId) }); setSelId(null); setText(""); }}>삭제</button>
          </div>
          {msg && <p role="status">{msg}</p>}
        </div>
      </div>
    </div>
  );
}

/** JSON.parse 실패 시 빈 객체로 대체해 Zod가 오류를 보고하게 한다 */
function safe(s: string): string {
  try { JSON.parse(s); return s; } catch { return "{}"; }
}
