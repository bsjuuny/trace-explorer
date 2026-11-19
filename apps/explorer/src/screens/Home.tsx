import { suggestionMessage } from "../lib/messages";
import { navigate } from "../router";
import { useApp } from "../store";

export function HomeScreen() {
  const { bundle, contentError, options, setOptions, origin, gpsMessage, lastNone, session, consent } = useApp();
  const startMystery = useApp((s) => s.startMystery);
  const useMyLocation = useApp((s) => s.useMyLocation);
  const useManualOrigin = useApp((s) => s.useManualOrigin);
  const setLocationConsent = useApp((s) => s.setLocationConsent);

  if (contentError) {
    return (
      <p role="alert" className="rounded-xl bg-[#fff7e8] p-4">
        콘텐츠를 불러오지 못했어요: {contentError}. 네트워크를 확인하고 새로고침해 주세요. (도감은 오프라인에서도 볼 수 있어요)
      </p>
    );
  }
  if (!bundle) return <p role="status">불러오는 중…</p>;

  const expired = Date.now() > Date.parse(bundle.expiresAt);
  const isDemo = bundle.places.length > 0 && bundle.places.every((p) => p.publication.isDemo);

  return (
    <section aria-labelledby="h-h" className="space-y-4">
      <h1 id="h-h" className="text-2xl font-bold">오늘의 미스터리</h1>

      {session?.status === "active" && (
        <div className="rounded-xl bg-[#edf7ef] p-4">
          진행 중인 탐험이 있어요.{" "}
          <button className="font-bold underline" onClick={() => navigate("mission")}>이어서 하기</button>
        </div>
      )}
      {expired && !isDemo && (
        <p role="alert" className="rounded-xl bg-[#fff7e8] p-4">
          콘텐츠 정보가 오래되어 새 탐험을 시작할 수 없어요. 앱을 업데이트한 뒤 다시 시도해 주세요.
        </p>
      )}

      <fieldset className="space-y-2">
        <legend className="font-semibold">탐험 시간</legend>
        <div className="flex gap-2">
          {([15, 30, 60] as const).map((m) => (
            <label key={m} className="flex min-h-[44px] flex-1 items-center justify-center rounded-lg border bg-white has-[:checked]:border-[#297f52] has-[:checked]:bg-[#e5f0e7] has-[:checked]:font-bold">
              <input type="radio" name="dur" className="sr-only" checked={options.durationMinutes === m} onChange={() => setOptions({ durationMinutes: m })} />
              {m}분
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className="font-semibold">테마</span>
        <select
          className="mt-1 w-full rounded-lg border bg-white px-3"
          value={options.themeId ?? ""}
          onChange={(e) => setOptions({ themeId: e.target.value || null })}
        >
          <option value="">무작위</option>
          {bundle.themes.filter((t) => t.active).map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-3">
        <input type="checkbox" className="h-6 w-6" checked={options.freeOnly} onChange={(e) => setOptions({ freeOnly: e.target.checked })} />
        무료 장소만
      </label>
      <label className="flex items-center gap-3">
        <input type="checkbox" className="h-6 w-6" checked={options.noReservation} onChange={(e) => setOptions({ noReservation: e.target.checked })} />
        예약 없이 갈 수 있는 곳만
      </label>

      <div className="rounded-xl bg-white p-3 text-sm">
        <p>출발점: {origin.kind === "gps" ? "내 위치" : "종로5가역(수동 선택)"}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button className="min-h-[44px] rounded-lg bg-[#e2efe6] px-3 font-semibold text-[#1d5e3e]" onClick={() => void useMyLocation()}>
            내 위치로 탐험
          </button>
          {origin.kind === "gps" && (
            <button className="min-h-[44px] rounded-lg bg-[#e2efe6] px-3 font-semibold text-[#1d5e3e]" onClick={useManualOrigin}>
              종로5가역에서 시작
            </button>
          )}
        </div>
        {!consent?.locationConsent && (
          <div className="mt-2 text-[#617369]">
            <p>위치 이용에 동의하지 않아 현장 체크인은 사용할 수 없어요.</p>
            <button className="mt-1 min-h-[44px] font-bold text-[#1d5e3e] underline" onClick={() => void setLocationConsent(true)}>
              위치 이용에 동의하기
            </button>
            <span className="text-sm"> (설정에서 언제든 철회할 수 있어요)</span>
          </div>
        )}
        {gpsMessage && <p role="status" className="mt-2">{gpsMessage}</p>}
      </div>

      <button
        disabled={expired && !isDemo}
        className="min-h-[44px] w-full rounded-xl bg-[#297f52] px-4 py-3 text-lg font-bold text-white disabled:opacity-40"
        onClick={() => {
          if (startMystery()) navigate("mission");
        }}
      >
        탐험 시작
      </button>

      {lastNone && (
        <div role="alert" className="rounded-xl bg-[#fff7e8] p-4">
          <p className="font-semibold">지금 조건에 맞는 장소가 없어요. 먼 곳을 억지로 고르지 않았어요.</p>
          <ul className="list-disc pl-5">
            {lastNone.map((s) => (
              <li key={s}>{suggestionMessage[s] ?? s}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
