import { useMemo, useState } from "react";
import { demoBundle } from "@trace/data";
import { summarizeDiff, validateBundle, type Issue } from "@trace/core";
import type { ContentBundle } from "@trace/schemas";
import { PlacesTab, TemplatesTab } from "./tabs";
import { BoundaryTab, SimulatorTab } from "./sim";

type Tab = "places" | "templates" | "sim" | "boundary" | "publish";
const TABS: Array<[Tab, string]> = [
  ["places", "장소"], ["templates", "템플릿"], ["sim", "미션 시뮬레이터"], ["boundary", "경계 테스트"], ["publish", "검증·내보내기"],
];

export function App() {
  const [bundle, setBundle] = useState<ContentBundle>(demoBundle);
  const [baseline, setBaseline] = useState<ContentBundle | null>(null);
  const [tab, setTab] = useState<Tab>("places");
  const [importMsg, setImportMsg] = useState("");

  const structural = useMemo(() => validateBundle(bundle, { public: false }), [bundle]);
  const publicCheck = useMemo(() => validateBundle(bundle, { public: true }), [bundle]);

  const onImport = async (f: File | undefined) => {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".json") || f.size > 5 * 1024 * 1024) {
      setImportMsg("JSON 파일(5MB 이하)만 가져올 수 있습니다.");
      return;
    }
    try {
      const raw: unknown = JSON.parse(await f.text());
      const r = validateBundle(raw, { public: false });
      if (!r.bundle) {
        setImportMsg(`스키마 검증 실패: ${r.issues.slice(0, 3).map((i) => `${i.path} ${i.message}`).join(" / ")}`);
        return;
      }
      setBundle(r.bundle);
      setBaseline(r.bundle);
      setImportMsg(`가져옴: ${f.name} (${r.bundle.places.length}개 장소)`);
    } catch {
      setImportMsg("JSON을 읽지 못했습니다.");
    }
  };

  const onExport = () => {
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `trace-content-${bundle.contentVersion}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <header className="top">
        <strong>TRACE 어드민</strong>
        <span>로컬 전용 편집기 · 콘텐츠 {bundle.contentVersion}</span>
        <label className="btn sub" style={{ padding: "6px 12px", borderRadius: 8, cursor: "pointer", background: "#e2efe6", color: "#1d5e3e", fontWeight: 600 }}>
          JSON 가져오기
          <input type="file" accept="application/json,.json" hidden onChange={(e) => void onImport(e.target.files?.[0])} />
        </label>
        <button className="btn" onClick={onExport}>JSON 내보내기</button>
        <button className="btn sub" onClick={() => { setBundle(demoBundle); setBaseline(null); }}>데모로 초기화</button>
      </header>
      <div className="warnbar">
        이 화면은 개발 PC에서만 사용합니다. 공개 서버에 올리지 말고, 내보낸 파일은 <code>pnpm data:publish -- &lt;파일&gt;</code> 검증을 통과해야 게시됩니다.
        {importMsg && <strong> · {importMsg}</strong>}
      </div>
      <nav className="tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>
      <main>
        {tab === "places" && <PlacesTab bundle={bundle} setBundle={setBundle} />}
        {tab === "templates" && <TemplatesTab bundle={bundle} setBundle={setBundle} />}
        {tab === "sim" && <SimulatorTab bundle={bundle} />}
        {tab === "boundary" && <BoundaryTab bundle={bundle} />}
        {tab === "publish" && (
          <div>
            <h2>검증 결과</h2>
            <IssueList title="구조 검증(저장 가능 기준)" issues={structural.issues} />
            <IssueList title="공개 기준 검증(게시 가능 기준)" issues={publicCheck.issues} />
            <h2>변경 요약{baseline ? "" : " (가져온 파일이 없어 비교 기준 없음)"}</h2>
            <pre>{summarizeDiff(baseline, bundle).join("\n")}</pre>
          </div>
        )}
      </main>
    </>
  );
}

function IssueList({ title, issues }: { title: string; issues: Issue[] }) {
  const errors = issues.filter((i) => i.level === "error");
  return (
    <section>
      <h3>
        {title}: {errors.length === 0 ? <span className="ok">통과</span> : <span className="bad">오류 {errors.length}건</span>}
      </h3>
      <ul>
        {issues.slice(0, 40).map((i, n) => (
          <li key={n} className={`issue-${i.level}`}>[{i.level}] {i.path}: {i.message}</li>
        ))}
        {issues.length > 40 && <li>… 외 {issues.length - 40}건</li>}
      </ul>
    </section>
  );
}
