import { useApp } from "../store";

export function DexScreen() {
  const bundle = useApp((s) => s.bundle);
  const progress = useApp((s) => s.progress);
  const places = bundle?.places ?? [];
  const found = places.filter((p) => progress.dex[p.id]);

  return (
    <section aria-labelledby="x-h" className="space-y-4">
      <h1 id="x-h" className="text-2xl font-bold">내 도감</h1>
      <p>누적 XP <strong>{progress.xp}</strong> · 발견 {found.length} / {places.length}</p>
      <p className="text-xs text-[#617369]">기록은 이 기기에만 저장돼요. 기기를 바꾸거나 브라우저 데이터를 지우면 사라질 수 있어요.</p>
      <ul className="space-y-2">
        {places.map((p) => {
          const e = progress.dex[p.id];
          return (
            <li key={p.id} className="flex items-center justify-between rounded-xl bg-white p-3">
              <span>{e ? p.name : "???  (아직 발견하지 못했어요)"}</span>
              {/* 색에만 의존하지 않고 텍스트로 상태를 표시 */}
              <span className="text-sm font-semibold">
                {e ? (e.verified ? "인증됨" : "미인증") : "미발견"}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
