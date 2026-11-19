import { useMemo, useState } from "react";
import { evaluateAccess, generateMystery, JONGNO5GA_STATION, type MysteryResult } from "@trace/core";
import type { ContentBundle, Eligibility } from "@trace/schemas";

export function SimulatorTab({ bundle }: { bundle: ContentBundle }) {
  const [lat, setLat] = useState(String(JONGNO5GA_STATION.lat));
  const [lng, setLng] = useState(String(JONGNO5GA_STATION.lng));
  const [dt, setDt] = useState("2026-11-19T10:00");
  const [dur, setDur] = useState<15 | 30 | 60>(15);
  const [fee, setFee] = useState(0);
  const [noRes, setNoRes] = useState(true);
  const [theme, setTheme] = useState("");
  const [seed, setSeed] = useState("sim-1");
  const [demo, setDemo] = useState(true);
  const [res, setRes] = useState<MysteryResult | null>(null);

  const run = () => {
    const iso = `${dt}:00+09:00`;
    setRes(generateMystery(
      { origin: { lat: Number(lat), lng: Number(lng) }, durationMinutes: dur, themeIds: theme ? [theme] : null, maxAdmissionFeeKrw: fee, requireNoReservation: noRes, visitedPlaceIds: [], localDateTime: iso, randomSeed: seed },
      bundle, { allowDemo: demo, nowIso: iso },
    ));
  };

  const counts = res ? {
    eligible: res.candidates.filter((c) => c.eligibility === "eligible").length,
    unknown: res.candidates.filter((c) => c.eligibility === "unknown").length,
    ineligible: res.candidates.filter((c) => c.eligibility === "ineligible").length,
  } : null;

  return (
    <div>
      <div className="row">
        <label className="field">위도<input value={lat} onChange={(e) => setLat(e.target.value)} /></label>
        <label className="field">경도<input value={lng} onChange={(e) => setLng(e.target.value)} /></label>
        <label className="field">날짜·시각(KST)<input type="datetime-local" value={dt} onChange={(e) => setDt(e.target.value)} /></label>
        <label className="field">시간
          <select value={dur} onChange={(e) => setDur(Number(e.target.value) as 15 | 30 | 60)}><option value={15}>15분</option><option value={30}>30분</option><option value={60}>60분</option></select>
        </label>
        <label className="field">최대 입장료(원)<input type="number" value={fee} onChange={(e) => setFee(Number(e.target.value))} /></label>
        <label className="field">테마
          <select value={theme} onChange={(e) => setTheme(e.target.value)}><option value="">무작위</option>{bundle.themes.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
        </label>
        <label className="field">seed<input value={seed} onChange={(e) => setSeed(e.target.value)} /></label>
        <label className="field">예약 불필요<input type="checkbox" checked={noRes} onChange={(e) => setNoRes(e.target.checked)} /></label>
        <label className="field">데모 허용<input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} /></label>
        <button className="btn" onClick={run}>시뮬레이션 실행</button>
      </div>
      {res && counts && (
        <>
          <p>후보 {res.candidates.length}개 → eligible {counts.eligible} · unknown {counts.unknown} · ineligible {counts.ineligible}
            {" "}· 엔진 {res.meta.engineVersion}/{res.meta.weightsVersion}/{res.meta.rng}</p>
          {res.status === "ok"
            ? <p className="ok">선택: {res.place.name} (점수 {res.selected.score}, 총 {res.selected.estimatedTotalMinutes}분)</p>
            : <p className="bad">후보 없음 — 제안: {res.suggestions.join(", ")}</p>}
          <table>
            <thead><tr><th>장소</th><th>판정</th><th>점수</th><th>이동(분)</th><th>총(분)</th><th>제외 사유</th></tr></thead>
            <tbody>
              {res.candidates.map((c) => (
                <tr key={c.placeId}><td>{c.placeId}</td><td>{c.eligibility}</td><td>{c.score}</td><td>{c.estimatedTravelMinutes ?? "-"}</td><td>{c.estimatedTotalMinutes ?? "-"}</td><td>{c.exclusions.join(", ")}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

type Case = { name: string; iso: string; fee: number; expect: Eligibility; reason?: string };

/** 종묘형(화 휴관·수 무료·월목금 시간제 해설·주말 일반·계절 시간) 정책 구조용 경계 케이스. 2026-11 기준. */
const CASES: Case[] = [
  { name: "화요일 정기 휴관", iso: "2026-11-17T10:00:00+09:00", fee: 0, expect: "ineligible", reason: "closed-day" },
  { name: "수요일 무료 일반관람", iso: "2026-11-18T10:00:00+09:00", fee: 0, expect: "eligible" },
  { name: "목요일 시간제 해설(자유 방문 불가)", iso: "2026-11-19T10:00:00+09:00", fee: 0, expect: "ineligible", reason: "guided-only" },
  { name: "일요일 유료(무료 한도에서 제외)", iso: "2026-11-22T10:00:00+09:00", fee: 0, expect: "ineligible", reason: "fee-exceeds-limit" },
  { name: "일요일 유료(요금 허용)", iso: "2026-11-22T10:00:00+09:00", fee: 1000, expect: "eligible" },
  { name: "11월 일요일 입장 마감(16:40 도착)", iso: "2026-11-22T16:40:00+09:00", fee: 1000, expect: "ineligible", reason: "last-entry-passed" },
];

export function BoundaryTab({ bundle }: { bundle: ContentBundle }) {
  const [pid, setPid] = useState(bundle.accessPolicies.find((p) => p.id.includes("heritage"))?.id ?? bundle.accessPolicies[0]?.id ?? "");
  const policy = bundle.accessPolicies.find((p) => p.id === pid);
  const rows = useMemo(() => policy ? CASES.map((c) => {
    const r = evaluateAccess(policy, { arrivalIso: c.iso, maxAdmissionFeeKrw: c.fee, requireNoReservation: false, stayMinutes: 4, allowUnverified: true });
    const pass = r.eligibility === c.expect && (!c.reason || r.reasons.includes(c.reason));
    return { c, r, pass };
  }) : [], [policy]);

  return (
    <div>
      <div className="row">
        <label className="field">대상 접근 정책
          <select value={pid} onChange={(e) => setPid(e.target.value)}>{bundle.accessPolicies.map((p) => <option key={p.id}>{p.id}</option>)}</select>
        </label>
      </div>
      <p>종묘형 정책 구조 기준 케이스입니다. 다른 정책에서는 FAIL이 정상일 수 있습니다. 실제 종묘 운영 규칙은 출시 전 공식 공지로 재확인해야 합니다.</p>
      <table>
        <thead><tr><th>케이스</th><th>기대</th><th>실제</th><th>사유</th><th>결과</th></tr></thead>
        <tbody>
          {rows.map(({ c, r, pass }) => (
            <tr key={c.name}><td>{c.name}</td><td>{c.expect}{c.reason ? ` (${c.reason})` : ""}</td><td>{r.eligibility}</td><td>{r.reasons.join(", ")}</td><td className={pass ? "ok" : "bad"}>{pass ? "PASS" : "FAIL"}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
