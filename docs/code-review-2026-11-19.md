# 코드 리뷰 기록 (2026-11-19)

Claude, Codex(v0.170.0), agy 세 리뷰어가 같은 프롬프트로 읽기 전용 정적 리뷰를 했다. 이 문서는 교차 결과와 조치 상태를 남긴다.
Codex는 첫 두 번의 실행이 리포트 없이 종료되어 업데이트 후 재실행했다. 아래 "한쪽만 지적" 항목은 수정 전에 코드로 재확인이 필요하다.

검증: 수정 후 `pnpm verify`(typecheck·lint·vitest 40건·data:validate·build)와 `pnpm e2e`(14건) 통과.

## 조치 완료

| # | 항목 | 지적 | 조치 |
|---|---|---|---|
| 1 | `pnpm build`·`dev`가 게시한 실콘텐츠를 데모로 덮어씀 | Claude, agy | `tools/export-static/index.ts`: 기존 `content.json`에 데모가 아닌 장소가 있으면 `--force` 없이는 건너뜀 |
| 2 | 미인증 기록 후 현장 인증 시 XP 영구 0 | Claude, agy | `rewards.ts`: `existing?.verified`일 때만 once 정책으로 XP 차단. 승격·재방문 테스트 추가 |
| 3 | 서비스 워커: 캐시 버전 고정, index.html cache-first, 번들 미프리캐시, 5xx 시 캐시 폴백 없음 | Claude, agy | `sw.js` + `vite.config.ts`(`swStamp` 플러그인): 빌드 해시로 캐시 버전 치환, 해시된 JS/CSS 프리캐시, 내비게이션 network-first, 콘텐츠는 `!res.ok`에서도 24시간 내 캐시로 폴백 |
| 4 | 날짜 문자열 무검증으로 만료·예외 무력화 | Claude, Codex, agy | `schemas`: `DateOnly`(실존 YYYY-MM-DD), `IsoDateTime`(파싱 가능 ISO) 적용. 스키마 테스트 추가 |
| 5 | 데모 모드가 데이터에서 파생(`some`) | Claude, Codex | `store.ts`, `Home.tsx`: 전부 데모인 번들일 때만 `allowDemo`. 실장소가 섞이면 엄격 기준 |
| 6 | `?seed=&now=`가 운영 빌드에서도 활성 | Claude, Codex | `store.ts`: DEV 또는 `VITE_ENABLE_QA_PARAMS=true`에서만 허용. `playwright.config.ts`가 해당 env로 빌드 |
| 7 | 완료 흐름에 상태 가드 없음, 보상 참조 소실 시 첫 보상으로 대체 | Claude, Codex | `store.ts`: `status==="active"`만 체크인·완료 허용, 보상 참조가 없으면 거부 |
| 8 | 체크인이 NaN·음수 accuracy·미래 timestamp를 통과 | Claude, Codex | `checkin.ts`: 유한성·범위·미래 시각(+5초 허용) 검사. 테스트 추가 |

## 미조치(후속 과제)

- **`special-open` 예외 규칙**(3개 모두 지적): 정기 휴무일을 덮지 못하고 `special-open-unverified`로 항상 `unknown`이 된다. 운영시간 표현 방식(스키마)을 정해야 해서 설계 결정이 필요하다.
- **미션과 테마 불일치, 장소당 첫 미션만 사용**(3개 모두, `engine.ts`): `mission.themeId` 필터와 다중 미션 우선순위 정책이 필요하다. agy는 검수된 미션이 미검수 미션에 밀려 장소가 탈락하는 경우도 지적했다.
- **공개 검증 누락**(Claude, `validate.ts`): 정책 신선도, 참조 존재, `contentVersion` 단조 증가, 번들 만료의 미래성, `adminNote`가 `data:publish`를 막는 모순.
- **저장소 견고성**(Codex, agy): 복원 데이터 스키마 검증, 진행도·세션 원자적 저장, `indexedDB.open` 실패 시 `dbPromise` 고정, 도감 삭제가 `onblocked`여도 성공 처리.
- **중첩 운영시간·요금이 배열 순서에 의존**(Codex, `access.ts`).
- **지도 위치 버튼이 동의 게이트 우회**(Claude, `MapView.tsx`)와 `legal.ts` 문구 불일치.
- **`data:validate`는 구조 검증만 통과하면 exit 0**(Codex): 데모 데이터가 공개 기준을 통과하지 못하는 것이 현재 설계라 유지했다. 실콘텐츠 게시 시 공개 검증을 CI 단계로 분리할 것.
- **어드민**: 루프백 바인딩에만 의존, 템플릿 id 변경 시 참조 고아화, 위·경도 `NaN`이 null로 변환(Claude, Codex, agy).
- **문서 불일치**: 같은 날 갱신 완료. `architecture.md`·`status.md`·`qa-checklist.md`의 카카오 SDK 서술을 OpenFreeMap 기준으로 정정, `status.md`의 서비스 워커 서술을 현재 동작에 맞춤, README·배포 문서에 `data:export` 가드와 QA 파라미터 제한 반영, 매니페스트 아이콘 부재는 `status.md` 한계에 기재. 아이콘 자체(PNG·maskable·apple-touch-icon)는 미조치.
- **테스트 공백**: `apps/**` 단위 테스트 없음, `exceptions`·월 경계·전날 시작 구간·`lastEntry`·요금 우선순위·`publish.ts` CLI 테스트 없음.

## 운영 메모

- 실콘텐츠를 게시한 뒤 데모로 되돌리려면 `pnpm data:export --force`.
- QA 파라미터가 필요한 빌드는 `VITE_ENABLE_QA_PARAMS=true`로 만든다(운영 배포 금지).
- 서비스 워커는 이제 빌드마다 캐시 이름이 바뀌므로, 배포 후 재방문자는 업데이트 안내를 받는다.
