import { DRAFT_NOTICE, LEGAL_DOCS } from "../lib/legal";

export function LegalScreen({ id }: { id: string }) {
  const doc = LEGAL_DOCS.find((d) => d.id === id);
  if (!doc) return <p>문서를 찾을 수 없어요.</p>;
  return (
    <article className="space-y-3">
      <p role="note" className="rounded-xl bg-[#fff7e8] p-3 text-sm">{DRAFT_NOTICE}</p>
      <h1 className="text-2xl font-bold">{doc.title}</h1>
      {doc.sections.map((s) => (
        <section key={s.h}>
          <h2 className="font-bold">{s.h}</h2>
          {s.p.map((t, i) => (
            <p key={i} className="text-sm">{t}</p>
          ))}
        </section>
      ))}
      <button className="min-h-[44px] rounded-lg bg-[#e2efe6] px-4 font-semibold text-[#1d5e3e]" onClick={() => history.back()}>
        돌아가기
      </button>
    </article>
  );
}
