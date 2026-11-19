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

## 후속 조치 완료 (같은 날 2차)

| 항목 | 조치 |
|---|---|
| `special-open` 예외 규칙 | `Exception`에 `open`·`close`·`mode`(선택 `lastEntryMinutesBeforeClose`·`feeKrw`) 추가, 특별 개방 기간에는 정기 휴관·일반 운영시간을 대체. 시간표가 검증되지 않았으면 통과시키지 않음. `from<=to`, special-open 필수 필드 검증. 테스트 7건 |
| 미션 선택·테마 불일치 | 후보를 (장소, 미션) 단위로 평가. 테마는 `mission.themeId`, 공개 모드는 검수된 미션만, 여럿이면 시드 난수. 엔진 1.1.0. 테마-장소 분류 불일치는 검증 경고. 테스트 4건 |
| 중첩 운영시간·요금 | 같은 요일·월에서 겹치는 운영시간, 일반 요금 중복, 요일 한정 요금 중복, 특별 개방 기간 중복을 오류로 차단 |
| 공개 검증 누락 | 공개 장소의 운영시간·유료 요금 신선도 verified, 장소별 미션 존재, 번들 만료, `publish`의 contentVersion 단조 증가(`--allow-older-version`으로 예외) |
| 스키마 크기 제한 | 문자열·배열 길이, 체크인 반경·정확도 상한 |
| 저장소 견고성 | DB 열기 실패 재시도, `versionchange` 시 연결 종료, 삭제 `blocked` 안내, 진행도·세션 단일 트랜잭션 저장 |
| `data:validate` CI | `pnpm data:validate:public`: 게시 산출물이 공개 기준을 통과하지 못하면 exit 1 |
| 어드민 | 위·경도 비정상 입력은 이전 값 유지(NaN→null 방지), 장소 삭제 시 연결 미션 함께 삭제, 템플릿 id 변경 시 참조 자동 갱신 |
| 아이콘 | PNG 192/512, maskable, `apple-touch-icon`(`pnpm icons`로 재생성) |
| 응답 헤더 | `.htaccess` 템플릿(CSP `frame-ancestors 'none'` 등). 카페24 지원 여부는 미확인 |

## 3차 리뷰(Claude·Codex, 2차 변경분) 반영

agy는 두 번 실행했으나 제한 시간 안에 출력이 없어 결과를 얻지 못했다(소스 변경 없음 확인). 아래는 Claude·Codex 지적 중 코드로 처리한 항목이다.

| 항목 | 지적 | 조치 |
|---|---|---|
| 삭제가 막혀도(`blocked`) 상태를 초기화해 경고가 사라짐 | Codex High | 삭제가 막히면 화면 상태를 유지하고 재시도 안내 표시 |
| `wipeAll`이 삭제 성공 후에도 `blocked:true`를 반환 | Claude | `onblocked` 후 대기 시간 안에 `onsuccess`가 오면 `blocked:false` |
| `data:export`가 손상된 `content.json`을 데모로 덮어씀 | Codex High | fail-closed: 파싱·구조 검증 실패 시 중단(`--force` 필요). 예전 스키마의 데모 전용 파일은 새 데모로 교체 |
| 자정 구간의 월 경계(12/31→1/1)와 휴관 판정 | Claude, Codex | 전날 시작 구간은 전날의 월·요일로 판정. 휴관일 새벽이라도 전날 영업이 이어지면 영업 중. `windowsOverlap`도 월 경계 꼬리 검사 |
| DB 열기 `onblocked`가 영구 메모리 모드/연결 누수 | Claude | 3초 대기 후 폴백, 늦게 열린 연결은 닫음 |
| DB 장애 중 쓰기가 재연결 후 유실 | Codex | 밀린 변경을 `pending`에 두고 DB가 열리면 한 트랜잭션으로 반영. 모든 트랜잭션 예외·abort 흡수, `wipeAll`과 쓰기 경합 방지 |
| `rebuildSession` 검증 부족 | Claude, Codex | `selected`·`meta`·`completion`·단서 범위·미션↔장소 참조까지 검증 |
| 서비스 워커 내비게이션 타임아웃·5xx 폴백 | Claude | 4초 후 캐시 셸로 폴백, `!ok`일 때도 캐시 우선 |
| 서비스 워커 빌드 ID가 manifest·아이콘·sw.js를 반영 안 함 | Claude, Codex | 해시에 포함, PNG 아이콘 프리캐시, 자리표시자 없으면 빌드 실패 |
| 테마 미지정 시 비활성 테마 미션 노출 | Codex | 항상 활성 테마만 허용 |
| 미션 배열 순서에 따라 선택 결과가 달라짐 | Codex | 쓸 수 있는 미션을 id 순으로 고정한 뒤 시드 선택 |
| 어드민 위·경도에 소수점 입력 불가 | Claude | 입력 중 문자열은 로컬 유지, 유효할 때만 반영 |
| 어드민이 참조 중인 테마·보상·정책 삭제 허용, 알림 잔존 | Claude, Codex | 참조 중이면 삭제 차단, 선택 변경 시 알림 초기화 |
| `contentVersion` 형식 무제한·비교 모호 | Codex, Claude | `YYYY-MM-DD(.N)` 형식으로 고정 |
| 데모 떡집 힌트 "새벽"이 운영시간 07:00과 불일치 | Claude, Codex | "이른 아침"으로 수정 |

## 4차 리뷰(agy, 2차 변경분) 반영

agy 재실행에서 결과를 얻었다(소스 변경 없음 확인). 코드로 재확인한 결과:

| 항목 | 판정 | 조치 |
|---|---|---|
| 자정을 넘기는 구간에서 요일 한정 요금이 도착일 요일로 계산됨 | 유효(High) | 전날 시작 구간은 시작일(전날) 요일 요금 적용, 테스트 추가 |
| 서비스 워커 갱신 직후 오프라인이면 `content.json`이 사라짐 | 유효(High) | `activate`에서 이전 캐시의 `content.json`·`content.prev.json`을 새 캐시로 옮긴 뒤 이전 캐시 삭제 |
| `wipeAll`이 삭제 성공 전에 메모리를 비워 상태 불일치 | 유효(Medium) | 삭제가 실제로 끝난 뒤에만 메모리·보류 변경 초기화 |
| 어드민 체크인 반경·정확도 입력이 빈 값에서 0으로 오염 | 유효(Low) | 좌표 입력과 같은 로컬 버퍼 입력(범위 1~500, 1~200) 적용 |
| 단일 운영시간의 24시간 초과 자기 겹침 검증 누락 | **오탐** | 운영시간은 open<close이면 같은 날 구간, 아니면 자정을 넘기는 최대 24시간 미만 구간이라 24시간을 넘는 구간을 표현할 수 없다 |
| 미션 삭제 시 고아 장소 발생 | **오탐** | 장소는 미션을 참조하지 않는다(미션이 장소를 참조) |

## 미조치(후속 과제)

- **클라이언트 `content.json` 해시·서명 검증**: 같은 출처의 해시 파일은 호스팅 탈취에 거의 도움이 되지 않아 보류. 별도 신뢰 경로(서명 키)가 필요하다.
- **`apps/**` 단위 테스트, 서비스 워커·`publish.ts` CLI 테스트**: 현재는 E2E에 의존. `publish.ts`는 대상 경로가 고정이라 임시 디렉터리 테스트를 위해 경로 주입 리팩터링이 필요하다.
- **`import-places`**: 외부 데이터 호출 승인 후 구현.
- **React 19·TypeScript 7·ESLint 10 등 메이저 업그레이드**: 취약점과 무관, 호환성 검증이 필요해 보류.
- **다중 미션 시드 선택의 e2e**: 데모는 장소당 미션 1개라 e2e에서 실행되지 않는다(단위 테스트로만 검증).
- **`closed` 예외가 전날 시작 구간의 자정 이후를 막는지**: 도착일 기준으로 판정하는 보수적 동작을 유지했다(특별 개방은 우회).
- **세션 GPS 출발점 복원**: 좌표를 저장하지 않는 개인정보 원칙과 충돌해 의도적으로 구현하지 않음.
