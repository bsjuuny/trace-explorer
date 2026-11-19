import { useState } from "react";
import { CONSENT_VERSION, DRAFT_NOTICE } from "../lib/legal";
import { navigate } from "../router";
import { useApp } from "../store";

export function ConsentScreen() {
  const accept = useApp((s) => s.acceptTerms);
  const [terms, setTerms] = useState(false);
  // 선택 동의는 기본 미선택
  const [loc, setLoc] = useState(false);

  return (
    <section aria-labelledby="c-h" className="space-y-4">
      <h1 id="c-h" className="text-2xl font-bold">시작하기 전에</h1>
      <p>TRACE는 15분 동안 종로5가역 주변에서 몰랐던 장소를 단서로 발견하는 탐험 게임입니다.</p>
      <div className="rounded-xl bg-[#fff7e8] p-4 text-sm">
        <strong>안전 주의</strong>
        <ul className="list-disc pl-5">
          <li>이동 중에는 주변과 교통 상황을 먼저 확인하세요.</li>
          <li>사유지·출입 제한 구역에는 들어가지 마세요. 구매·유료 입장·촬영은 필수가 아닙니다.</li>
          <li>이 서비스는 만 14세 이상 이용자를 대상으로 합니다.</li>
        </ul>
      </div>
      <p className="text-sm text-[#617369]">{DRAFT_NOTICE}</p>

      <p className="text-sm">
        문서 보기:{" "}
        <a className="inline-link" href="#/legal/terms-of-service">이용약관</a>{" · "}
        <a className="inline-link" href="#/legal/privacy-policy">개인정보 처리방침</a>{" · "}
        <a className="inline-link" href="#/legal/location-terms">위치기반서비스 약관</a>
      </p>

      <label className="flex items-start gap-3">
        <input type="checkbox" className="mt-1 h-6 w-6" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
        <span>(필수) 이용약관과 개인정보 처리방침을 확인했고, 만 14세 이상입니다.</span>
      </label>
      <label className="flex items-start gap-3">
        <input type="checkbox" className="mt-1 h-6 w-6" checked={loc} onChange={(e) => setLoc(e.target.checked)} />
        <span>
          (선택) 근처 탐험과 현장 체크인을 위해 현재 위치를 이용하는 것에 동의합니다. 동의하지 않아도 종로5가역에서 출발하는 체험은 이용할 수 있어요. 브라우저의 위치 권한 요청은 '내 위치로 탐험'을 누를 때만 나타납니다.
        </span>
      </label>
      <p className="text-xs text-[#617369]">문서 버전 {CONSENT_VERSION}</p>

      <button
        disabled={!terms}
        onClick={async () => {
          await accept(loc);
          navigate("");
        }}
        className="min-h-[44px] w-full rounded-xl bg-[#297f52] px-4 py-3 font-bold text-white disabled:opacity-40"
      >
        동의하고 시작
      </button>
    </section>
  );
}
