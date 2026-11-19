import { navigate } from "../router";
import { useApp } from "../store";

export function DiscoveryScreen() {
  const session = useApp((s) => s.session);
  const progress = useApp((s) => s.progress);
  const clearSession = useApp((s) => s.clearSession);
  if (!session?.completion) return <p>완료된 탐험이 없어요.</p>;

  const { place, completion } = session;
  const verified = completion.method === "checked-in";
  return (
    <section aria-labelledby="d-h" className="space-y-4">
      <h1 id="d-h" className="text-2xl font-bold">발견했어요!</h1>
      <div className="rounded-xl bg-white p-4 shadow-sm">
        <p className="text-sm text-[#617369]">오늘의 미스터리 장소</p>
        <p className="text-xl font-bold">{place.name}</p>
        <p className="mt-1 text-sm">
          정보 확인 시점: {place.source.lastCheckedAt ?? "확인 기록 없음(미검증)"}
          {place.publication.isDemo && " · 데모 콘텐츠(실제 장소 아님)"}
        </p>
      </div>
      <div role="status" className="rounded-xl bg-[#edf7ef] p-4">
        {completion.duplicate ? (
          <p>이미 기록된 탐험이라 중복 지급되지 않았어요.</p>
        ) : verified ? (
          <p>현장 인증 완료 · 획득 XP <strong>{completion.granted}</strong> (누적 {progress.xp})</p>
        ) : (
          <p>도감에 '미인증'으로 기록했어요. 현장에서 인증하면 정식 기록이 돼요. (XP 없음)</p>
        )}
      </div>
      <div className="flex gap-2">
        <button className="min-h-[44px] flex-1 rounded-xl bg-[#297f52] px-4 py-3 font-bold text-white" onClick={() => { clearSession(); navigate(""); }}>
          다음 탐험
        </button>
        <button className="min-h-[44px] flex-1 rounded-xl bg-[#e2efe6] px-4 py-3 font-bold text-[#1d5e3e]" onClick={() => { clearSession(); navigate("dex"); }}>
          도감 보기
        </button>
      </div>
    </section>
  );
}
