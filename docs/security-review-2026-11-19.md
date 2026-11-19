# 보안 리뷰 기록 (2026-11-19)

Claude, Codex(v0.170.0), agy 세 리뷰어가 같은 프롬프트로 읽기 전용 정적 보안 리뷰를 했다. 이 문서는 교차 결과, 조치 상태, 남은 위험을 남긴다.
CVE는 리뷰어가 아니라 `pnpm audit`으로 별도 확인했다(아래 의존성 항목).

검증: 수정 후 `pnpm typecheck`, `pnpm lint`, `pnpm test`(42건), `pnpm data:validate`, `pnpm build`, `pnpm e2e`(14건) 통과.

## 총평

Critical은 없다(agy는 content.json 런타임 검증 누락을 Critical로 봤으나 공격 전제가 호스팅·저장소 쓰기 권한 탈취라 Medium~High로 판단). `dangerouslySetInnerHTML`·`eval`·프로토타입 병합·커밋된 비밀값은 발견되지 않았다. 서버가 없는 정적 PWA라 공격면은 작고, 주된 위험은 **클라이언트 신뢰**와 **배포·게시 단계**에 있다.

## 조치 완료

| 항목 | 지적 | 조치 |
|---|---|---|
| 지도 위치 버튼이 동의 게이트를 우회 | 3개 모두 | `MapView`에 `allowLocate` 추가, 위치 동의가 있을 때만 `GeolocateControl` 생성. `legal.ts`의 위치 이용·제3자 전달 문구를 실제 동작(타일 좌표로 대략적 위치 추정 가능, 체크인·지도 버튼에서도 권한 요청)에 맞춤 |
| 서비스 워커 캐시 정책 | 3개 모두 | 오래된 캐시 삭제를 `trace-` 접두어 캐시로 한정(공유 도메인 보호), 내비게이션은 정상 HTML 응답(`ok`·`basic`·비리다이렉트·`text/html`)만 `index.html`로 캐시, `/content/` 매칭을 `content.json`·`content.prev.json`으로 엄격화, 런타임 캐시를 해시 에셋·셸 파일로 한정 |
| 게시 파이프라인 검증·백업 | Claude, agy, Codex | `publish.ts`: 구조 검증 → `toPublicBundle`(adminNote·verifiedBy 제거) → 제거된 산출물 기준 공개 검증 순서로 변경(관리자 메모가 있어도 게시 가능). 기존 파일 파싱을 try로 감싸고, 검증을 통과한 비데모 정상본만 `content.prev.json`으로 백업 |
| `data:export` 가드가 기존 파일을 검증 없이 보존 | Codex | 보존하려는 `content.json`에 공개 기준 검증을 적용하고 실패하면 빌드를 중단 |
| 번들 만료 미검사 | agy | 공개 검증에 `expiresAt` 미래 여부 추가(`nowIso` 옵션) |
| IndexedDB 상태 무검증(XP·도감·세션 위조) | 3개 모두 | `restoreProgress`(core)로 진행 상태 형식 검증·정규화(`__proto__` 키 무시), 저장된 세션은 장소·미션을 현재 번들의 같은 id 항목으로 교체하고 id가 없으면 폐기. 테스트 추가 |
| 어드민에 CSP·Referrer-Policy 없음 | 3개 모두 | `apps/admin/index.html`에 CSP와 `no-referrer` 추가, `server.allowedHosts`·`fs.strict` 명시 |
| `sourceUrl`이 `javascript:` 스킴 허용 | Claude | 스키마를 `http(s)://`로 제한 |

## 리뷰어 주장 중 틀렸던 것

- agy의 "서비스 워커 프리캐시 이중 인코딩"은 오류였다. 빌드 산출물의 `PRECACHE`는 한 번만 인코딩되어 `JSON.parse`가 배열을 반환한다(`dist/sw.js`로 확인).

## 미조치·남은 위험

- **클라이언트의 `content.json` 변조 방어**: 브라우저는 구조 스키마만 검사한다. 호스팅 계정 탈취나 업로드 단계 변조를 막으려면 산출물 해시·서명 검증이 필요하다(Codex·agy·Claude 공통 제안). 이번에는 빌드·게시 단계 검증만 강화했다.
- **체크인·XP는 본질적으로 클라이언트 신뢰**: DevTools 위치 모의나 저장소 직접 수정은 막을 수 없다. XP를 쿠폰 등 실제 가치가 있는 보상에 연결하려면 서버 검증(영수증·현장 QR)이 필요하다.
- **CSP가 meta에만 있음**: `frame-ancestors`(클릭재킹 방어)는 meta에서 무시된다. 카페24에서 응답 헤더로 `Content-Security-Policy`(`frame-ancestors 'none'`), `X-Content-Type-Options: nosniff`, `Permissions-Policy: geolocation=(self)`, 필요 시 `Referrer-Policy: no-referrer`를 설정해야 한다(배포 단계 작업).
- **지도 타일의 제3자 노출**: 타일 요청으로 IP와 보는 영역이 OpenFreeMap에 전달된다. 개인정보 처리방침 확정 전 네트워크 캡처 확인 또는 자체 호스팅(PMTiles)을 검토한다.
- **의존성**: 같은 날 업그레이드 완료. `pnpm audit`이 16건(critical 3, high 2, moderate 10, low 1)을 보고해서 vite 5.4→7.3.8, vitest 2.1→4.1.12, zod 3.25→4.6.7로 올렸고 재감사 결과 알려진 취약점 0건이다. `pnpm verify`·`pnpm e2e`(14건) 통과. 나머지 메이저 뒤처짐(react 18, typescript 5.9, eslint 9 등)은 취약점과 무관해 유지했다.
- **스키마 크기 제한 없음**: 변조된 대형 배열·문자열로 브라우저가 멈출 수 있다. `.max()` 제한과 응답 크기 제한을 추가해야 한다(Codex).
- **어드민 인증 없음**: loopback 바인딩과 `allowedHosts`에만 의존한다. 원격 사용이 필요하면 인증을 도입한다.
- **QA 파라미터 빌드**: `VITE_ENABLE_QA_PARAMS=true` 빌드를 배포하면 `now` 조작으로 운영 시간 판정을 우회할 수 있다. 배포 파이프라인에서 이 변수가 설정되지 않았는지 확인한다.
- **어드민 CSP는 `unsafe-inline` 허용**: vite 개발 서버의 인라인 스크립트 때문이다.
