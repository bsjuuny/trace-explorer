# 카페24 정적 배포 가이드

> 아직 배포하지 않았습니다. 아래는 절차 초안이며, 실제 카페24 호스팅 상품의 제약(응답 헤더·서브디렉터리·SPA fallback 지원)은 배포 전에 확인해야 합니다.

## 1. 빌드
```bash
cp .env.example .env     # 기본 지도(OpenFreeMap)는 키가 필요 없음
pnpm install --frozen-lockfile
pnpm verify
```
산출물: `apps/explorer/dist/`. 하위 경로 배포는 `VITE_BASE_PATH=/trace/` 처럼 지정(기본은 상대 경로 `./`라 대부분 그대로 동작). 라우팅은 **해시 라우팅**이라 SPA fallback 설정이 필요 없습니다.

## 2. 업로드
`dist/` 안의 모든 파일을 FTP/파일 관리자로 업로드. `sw.js`는 사이트 루트(또는 앱 경로 루트)에 있어야 하며 서비스 워커 범위가 앱 경로입니다. HTTPS 필수(Geolocation·서비스 워커 조건).

## 3. 지도(OpenFreeMap + MapLibre)
1. 기본 스타일은 `https://tiles.openfreemap.org/styles/liberty`(키 불필요). 지도 우측 하단 출처 표기(OpenFreeMap · OpenMapTiles · OpenStreetMap)를 지우지 않습니다.
2. 무료 서비스의 **이용 조건·사용량 한도·지속 가능성은 배포 전에 공식 문서로 확인**하고 여기에 기록(미확인). 트래픽이 늘면 서울 일대 PMTiles 자체 호스팅으로 전환을 검토(카페24가 HTTP Range 요청을 지원하는지 먼저 확인 필요, 미확인).
3. 스타일 주소를 바꾸면 `index.html` CSP의 `img-src`·`connect-src`도 함께 바꿉니다.
4. 외부 지도 길 안내 버튼은 제거했습니다(2026-11-19 결정). 따라서 앱은 카카오맵을 포함한 어떤 외부 지도 링크도 만들지 않습니다.

## 3-1. 응답 헤더(권장)
`index.html`의 meta CSP는 `frame-ancestors`를 적용하지 못합니다. 호스팅이 허용하면(`.htaccess` 등) 다음을 응답 헤더로도 설정합니다: `Content-Security-Policy`(meta와 같은 정책 + `frame-ancestors 'none'`), `X-Content-Type-Options: nosniff`, `Permissions-Policy: geolocation=(self)`, 필요 시 `Referrer-Policy: no-referrer`. 헤더 지원 여부는 카페24에서 확인 필요(미확인). 운영 빌드에는 `VITE_ENABLE_QA_PARAMS`를 설정하지 않습니다.

## 4. 배포 후 점검 (실제 도메인)
- HTTPS에서 첫 화면·동의·위치 권한 요청이 '내 위치로 탐험' 클릭 전에는 뜨지 않는지(위치 동의가 없으면 지도 위치 버튼도 보이지 않는지)
- 지도 로드, 새로고침 후 진행 복구, PWA 설치, IndexedDB 유지
- iPhone Safari / Android Chrome 실기기 GPS 승인·거부
- 서비스 워커 업데이트 안내(빌드마다 캐시 이름이 바뀜)(새 버전 업로드 후 기존 접속자에게 "업데이트" 표시)

## 5. 콘텐츠 갱신·롤백
`pnpm data:publish -- <파일>` 통과본만 `public/content/content.json`에 반영, 직전본은 `content.prev.json`. `pnpm build`가 호출하는 `data:export`는 게시된 실콘텐츠를 덮어쓰지 않으며, 데모로 되돌리려면 `pnpm data:export -- --force`. 앱은 최신 본이 깨지면 직전본으로 롤백. 콘텐츠 `expiresAt`이 지나면 공개 모드는 신규 탐험을 차단합니다.
