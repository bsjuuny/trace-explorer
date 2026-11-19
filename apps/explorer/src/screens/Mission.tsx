import { useEffect } from "react";
import { MapView } from "../components/MapView";
import { checkInMessage } from "../lib/messages";
import { navigate } from "../router";
import { useApp } from "../store";

export function MissionScreen() {
  const { session, consent, checkIn, origin, bundle } = useApp();
  const { revealNextClue, revealExtraHint, endMission, tryCheckIn, completeSelfReported, clearSession, setLocationConsent } = useApp.getState();

  useEffect(() => {
    if (!session) navigate("");
    else if (session.status === "completed") navigate("discovery");
  }, [session]);

  if (!session) return null;

  // 내부 분류 id(restaurant 등) 대신 사용자용 테마 이름("식당" 등)으로 보여준다. 매칭되는 테마가 없으면 분류는 생략한다.
  const kindLabel = (bundle?.themes ?? [])
    .filter((t) => t.categories.some((c) => session.place.categories.includes(c)))
    .map((t) => t.label)
    .join("·");

  if (session.status === "ended") {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-bold">탐험을 종료했어요</h1>
        <p>목적지는 <strong>{session.place.name}</strong> 이었어요. 언제든 다시 도전해 보세요.</p>
        <button className="min-h-[44px] w-full rounded-xl bg-[#297f52] px-4 py-3 font-bold text-white" onClick={() => { clearSession(); navigate(""); }}>
          홈으로
        </button>
      </section>
    );
  }

  const { mission } = session;
  const canCheckIn = !!consent?.locationConsent;
  const failReason = checkIn.state === "failed" ? checkIn.reason : undefined;
  const failText =
    failReason === "denied" ? "위치 권한이 거부됐어요. 브라우저 설정에서 변경하거나, 아래 '기록만 저장'을 이용할 수 있어요."
    : failReason === "timeout" ? "위치 확인 시간이 초과됐어요. 다시 시도해 주세요."
    : failReason === "unavailable" ? "이 기기에서 위치를 사용할 수 없어요."
    : failReason ? checkInMessage[failReason] : "";

  return (
    <section aria-labelledby="m-h" className="space-y-4">
      <h1 id="m-h" className="text-2xl font-bold">단서를 따라가 보세요</h1>
      <p className="text-sm text-[#617369]">
        예상 소요 약 {session.selected.estimatedTotalMinutes}분(이동 {session.selected.estimatedTravelMinutes}분,
        {session.selected.routeEstimateConfidence === "verified" ? " 실측" : " 추정"}). 시간이 넘어도 실패가 아니에요.
      </p>

      <MapView origin={origin} allowLocate={!!consent?.locationConsent} />

      <ol className="space-y-2" aria-label="단서 목록">
        {mission.clues.slice(0, session.cluesShown).map((c) => (
          <li key={c.order} className="rounded-xl bg-white p-4 shadow-sm">
            <span className="mr-2 rounded-full bg-[#e5f0e7] px-2 py-0.5 text-xs font-bold text-[#276444]">단서 {c.order}</span>
            {/* 단서는 항상 plain text로 렌더링한다 */}
            <span>{c.text}</span>
          </li>
        ))}
      </ol>
      {session.extraHint && (
        <p className="rounded-xl bg-[#edf7ef] p-3 text-sm" role="status">
          추가 힌트: {kindLabel ? `${kindLabel} 종류의 장소이고, ` : ""}출발점에서 걸어서 약 {session.selected.estimatedTravelMinutes}분 거리예요.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button disabled={session.cluesShown >= 3} onClick={revealNextClue} className="min-h-[44px] rounded-lg bg-[#e2efe6] px-4 font-semibold text-[#1d5e3e] disabled:opacity-40">
          다음 단서
        </button>
        <button disabled={session.extraHint} onClick={revealExtraHint} className="min-h-[44px] rounded-lg bg-[#e2efe6] px-4 font-semibold text-[#1d5e3e] disabled:opacity-40">
          추가 힌트
        </button>
      </div>

      <div className="rounded-xl bg-white p-4">
        <h2 className="font-bold">현장 체크인</h2>
        {canCheckIn ? (
          <button disabled={checkIn.state === "locating"} onClick={() => void tryCheckIn()} className="mt-2 min-h-[44px] w-full rounded-lg bg-[#297f52] px-4 font-bold text-white disabled:opacity-50">
            {checkIn.state === "locating" ? "위치 확인 중…" : "도착했어요 (위치 확인)"}
          </button>
        ) : (
          <div className="mt-2 text-sm text-[#617369]">
            <p>위치 이용에 동의하지 않아 현장 체크인이 꺼져 있어요. 아래 '기록만 저장'은 언제든 쓸 수 있어요.</p>
            <button className="mt-1 min-h-[44px] font-bold text-[#1d5e3e] underline" onClick={() => void setLocationConsent(true)}>
              위치 이용에 동의하고 체크인 켜기
            </button>
            <span> (설정에서 언제든 철회할 수 있어요)</span>
          </div>
        )}
        {failText && <p role="alert" className="mt-2 text-sm text-[#8a4b00]">{failText}</p>}
        <button onClick={completeSelfReported} className="mt-2 min-h-[44px] w-full rounded-lg bg-[#f2f5ef] px-4 font-semibold">
          기록만 저장 (현장 인증 없음, XP 없음)
        </button>
      </div>

      <button onClick={endMission} className="min-h-[44px] w-full rounded-lg border border-[#c9d6cb] px-4 font-semibold">
        탐험 종료
      </button>
    </section>
  );
}
