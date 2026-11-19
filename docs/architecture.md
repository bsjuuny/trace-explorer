# 아키텍처

## 계층
`schemas`(타입·Zod) ← `core`(순수 로직, DOM 비의존) ← `explorer`/`admin`(UI). `data`는 데모 콘텐츠, `templates`는 빈 템플릿.

`PlaceRepository` 인터페이스 + `StaticPlaceRepository`(fetch + Zod). 이후 `ApiPlaceRepository`로 바꿔도 엔진·화면은 변하지 않습니다.

## 엔진 규칙 요약
- 판정은 `eligible / ineligible / unknown` 3값. 오래됐거나 검증 안 된 시간표·요금은 통과시키지 않고 `unknown`(데모 모드에서만 `allowUnverified`).
- 15분 적합성: `이동 + 체류 + 단서(4) + 기록(2) + 여유(2) <= 요청 시간`. ETA는 `verified` 실측 우선, `approximate`는 직선거리 x 1.4 / 70m/분이며 직선 700m 초과·`unknown`은 제외.
- 점수 동점은 `placeId` 순. PRNG는 FNV-1a 해시 + mulberry32, 결과 메타에 엔진/가중치/PRNG 버전과 seed를 기록. 알고리즘을 바꾸면 `ENGINE_VERSION`·`SCORE_WEIGHTS_VERSION`을 올리고 회귀 테스트를 갱신합니다.
- 야외 미션은 06:00~19:00(도착 기준)만. 후보가 없으면 먼 곳을 고르지 않고 제안(시간 확대·무료 해제 등)을 돌려줍니다.
- 체크인: 반경 + 정확도 + 측정 시각(30초, 미래 시각·NaN·음수 정확도 거부)을 함께 판정. 완료 키 `missionId:placeId:startedAt`로 XP·도감 지급은 멱등. 현장 인증 없는 "기록만 저장"은 XP 0, 도감 미인증이며, 이후 현장 인증하면 인증으로 승격되고 XP를 지급(이미 인증된 장소만 once 정책으로 XP 차단). 진행 중 세션만 완료·체크인 가능.

## 저장
IndexedDB `trace-explorer` v2(키-값). v1→v2 마이그레이션 포함. 저장: 동의 상태·도감/XP·진행 중 탐험. **이동 경로·좌표 이력은 저장하지 않음.** 복원 시 저장값을 신뢰하지 않는다: 진행 상태는 `restoreProgress`로 형식 검증·정규화하고, 세션의 장소·미션은 현재 번들의 같은 id 항목으로 교체(없으면 폐기). 삭제는 `deleteDatabase`로 실제 삭제.

## 보안 경계
- 장소명·단서는 항상 plain text 렌더(`dangerouslySetInnerHTML` 금지 lint 규칙).
- CSP·Referrer-Policy를 `index.html` meta로 적용(외부 허용 도메인은 지도 타일 서버 `tiles.openfreemap.org`뿐). 호스팅이 응답 헤더를 지원하면 같은 정책을 헤더로도 적용.
- 공개 번들 allowlist: `adminNote`·`verifiedBy` 제거 후 그 산출물을 기준으로 공개 검증(데모·미검수·만료 차단). 소스맵 비공개. 날짜 필드는 스키마에서 실존 날짜·파싱 가능한 ISO로 검증.
- 데모 모드(`allowDemo`)는 번들이 전부 데모일 때만. `?seed=&now=`는 개발 서버 또는 `VITE_ENABLE_QA_PARAMS=true` 빌드에서만 동작.
- 서비스 워커: 캐시 이름에 빌드 해시, `trace-` 접두어 캐시만 정리, 내비게이션은 network-first(정상 HTML만 캐시), 런타임 캐시는 해시 에셋·셸 파일로 한정, `content.json`은 network-first + 24시간 TTL.
- 지도 위치 버튼은 위치 동의 시에만 노출. 체크인·XP는 서버 검증이 없는 클라이언트 신뢰 구조이므로 실제 가치가 있는 보상에 연결하지 않는다.
- 어드민은 `127.0.0.1` 바인딩(`allowedHosts` 명시), CSP·`no-referrer` 적용, 사용자 빌드에 미포함. 인증은 없음.
- 상세 리뷰 결과와 남은 위험: `code-review-2026-11-19.md`, `security-review-2026-11-19.md`.
