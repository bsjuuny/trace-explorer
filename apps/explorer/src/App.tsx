import { useEffect } from "react";
import { useServiceWorkerUpdate } from "./lib/sw";
import { navigate, usePath } from "./router";
import { ConsentScreen } from "./screens/Consent";
import { DexScreen } from "./screens/Dex";
import { DiscoveryScreen } from "./screens/Discovery";
import { HomeScreen } from "./screens/Home";
import { LegalScreen } from "./screens/Legal";
import { MissionScreen } from "./screens/Mission";
import { SettingsScreen } from "./screens/Settings";
import { useApp } from "./store";

const NAV: Array<[string, string]> = [["", "홈"], ["dex", "도감"], ["settings", "설정"]];

export function App() {
  const path = usePath();
  const { ready, consent, bundle, session } = useApp();
  const init = useApp((s) => s.init);
  const { updateReady, apply } = useServiceWorkerUpdate();

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (ready && !consent && !path.startsWith("legal/") && path !== "consent") navigate("consent");
  }, [ready, consent, path]);

  const isDemo = !!bundle?.places.some((p) => p.publication.isDemo);

  let body;
  if (!ready) body = <p role="status">불러오는 중…</p>;
  else if (!consent && !path.startsWith("legal/")) body = <ConsentScreen />;
  else if (path.startsWith("legal/")) body = <LegalScreen id={path.slice(6)} />;
  else if (path === "mission") body = <MissionScreen />;
  else if (path === "discovery") body = <DiscoveryScreen />;
  else if (path === "dex") body = <DexScreen />;
  else if (path === "settings") body = <SettingsScreen />;
  else if (path === "consent") body = <ConsentScreen />;
  else body = <HomeScreen />;

  return (
    <div className="mx-auto min-h-screen max-w-xl pb-24">
      <header className="bg-[#18382c] px-4 py-3 text-white">
        <span className="text-xs font-bold tracking-widest text-[#aee2be]">TRACE</span>
        <p className="font-bold">종로5가 미스터리 탐험</p>
      </header>
      {isDemo && (
        <p role="note" className="bg-[#fff7e8] px-4 py-2 text-sm">
          <strong>데모 모드</strong> — 표시되는 장소는 실제 업체·장소가 아닌 시험용 데이터이며 위치도 임의 지점입니다.
        </p>
      )}
      {updateReady && (
        <div role="status" className="flex items-center justify-between bg-[#edf7ef] px-4 py-2 text-sm">
          <span>새 버전이 있어요.</span>
          <button className="min-h-[44px] rounded-lg bg-[#297f52] px-3 font-bold text-white" onClick={apply}>업데이트</button>
        </div>
      )}
      <main className="px-4 py-5">{body}</main>
      {consent && (
        <nav aria-label="주 메뉴" className="fixed inset-x-0 bottom-0 border-t bg-white">
          <ul className="mx-auto flex max-w-xl">
            {NAV.map(([p, label]) => (
              <li key={p} className="flex-1">
                <a
                  href={`#/${p}`}
                  aria-current={path === p ? "page" : undefined}
                  className={`flex min-h-[56px] items-center justify-center font-semibold ${path === p ? "text-[#1d5e3e] underline" : "text-[#536458]"}`}
                >
                  {label}
                  {p === "" && session?.status === "active" ? " (진행 중)" : ""}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
