import { useEffect, useState } from "react";
import { CONSENT_VERSION, LEGAL_DOCS } from "../lib/legal";
import { navigate } from "../router";
import { useApp } from "../store";

export function SettingsScreen() {
  const consent = useApp((s) => s.consent);
  const rolledBack = useApp((s) => s.rolledBack);
  const bundle = useApp((s) => s.bundle);
  const setLocationConsent = useApp((s) => s.setLocationConsent);
  const wipe = useApp((s) => s.wipeEverything);
  const [perm, setPerm] = useState<string>("확인 불가");
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    // 브라우저 위치 권한 상태는 동의 상태와 별개로 표시한다(조회만 하며 권한을 요청하지 않는다).
    navigator.permissions?.query({ name: "geolocation" }).then(
      (r) => setPerm({ granted: "허용됨", denied: "거부됨", prompt: "아직 묻지 않음" }[r.state] ?? r.state),
      () => setPerm("확인 불가"),
    );
  }, []);

  return (
    <section aria-labelledby="s-h" className="space-y-5">
      <h1 id="s-h" className="text-2xl font-bold">설정·도움말</h1>

      <div className="rounded-xl bg-white p-4">
        <h2 className="font-bold">위치</h2>
        <p className="text-sm">서비스 내 위치 이용 동의: <strong>{consent?.locationConsent ? "동의함" : "동의 안 함"}</strong></p>
        <p className="text-sm">브라우저 위치 권한: <strong>{perm}</strong> (브라우저 사이트 설정에서 변경)</p>
        <label className="mt-2 flex items-center gap-3">
          <input type="checkbox" className="h-6 w-6" checked={!!consent?.locationConsent} onChange={(e) => void setLocationConsent(e.target.checked)} />
          위치 이용에 동의
        </label>
        <p className="mt-2 text-xs text-[#617369]">GPS는 건물 사이·지하에서 부정확할 수 있고 조작될 수 있어요. 위치는 개인 게임 기록에만 쓰여요. 동의한 문서 버전: {consent?.version ?? "-"} (현재 {CONSENT_VERSION})</p>
      </div>

      <div className="rounded-xl bg-white p-4">
        <h2 className="font-bold">문서</h2>
        <ul className="list-disc pl-5">
          {LEGAL_DOCS.map((d) => (
            <li key={d.id}><a className="inline-link" href={`#/legal/${d.id}`}>{d.title}</a></li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl bg-white p-4">
        <h2 className="font-bold">콘텐츠 정보</h2>
        <p className="text-sm">콘텐츠 버전 {bundle?.contentVersion ?? "-"} · 만료 {bundle?.expiresAt.slice(0, 10) ?? "-"}</p>
        {rolledBack && <p className="text-sm text-[#8a4b00]">최신 콘텐츠를 읽지 못해 직전 정상 버전을 사용 중이에요.</p>}
      </div>

      <div className="rounded-xl bg-white p-4">
        <h2 className="font-bold">내 기록 삭제</h2>
        <p className="text-sm">도감·XP·동의 기록·진행 중 탐험이 이 기기에서 완전히 삭제돼요. 되돌릴 수 없어요.</p>
        {!confirming ? (
          <button className="mt-2 min-h-[44px] rounded-lg bg-[#f6dcd8] px-4 font-semibold text-[#7a1f12]" onClick={() => setConfirming(true)}>
            내 기록 모두 삭제
          </button>
        ) : (
          <div className="mt-2 flex gap-2">
            <button
              className="min-h-[44px] rounded-lg bg-[#b3261e] px-4 font-semibold text-white"
              onClick={async () => {
                await wipe();
                setConfirming(false);
                navigate("consent");
              }}
            >
              정말 삭제
            </button>
            <button className="min-h-[44px] rounded-lg bg-[#f2f5ef] px-4 font-semibold" onClick={() => setConfirming(false)}>취소</button>
          </div>
        )}
      </div>
    </section>
  );
}
