# TRACE — 종로5가 미스터리 탐험 MVP

15분 동안 종로5가역 주변에서 평소 몰랐던 장소를 단서로 발견하는 모바일 웹 게임. 카페24 정적 호스팅에 올릴 수 있는 정적 PWA와, 개발 PC 전용 로컬 어드민으로 구성됩니다.

> **현재 상태: 코드 MVP(데모 데이터)입니다.** 실제 장소 30개·미션 10개 검증, 현장 QA, 법무 검토, 카페24 배포는 **아직 하지 않았습니다.** 앱 안의 모든 장소는 `[데모]` 표기이며 실제 업체가 아닙니다. 자세한 구분은 [docs/status.md](docs/status.md).

## 빠른 시작

```bash
pnpm install --frozen-lockfile
pnpm dev            # 사용자 앱 http://127.0.0.1:5173
pnpm dev:admin      # 로컬 어드민 http://127.0.0.1:5174 (개발 PC 전용)
pnpm verify         # typecheck → lint → test → data:validate → build
pnpm e2e            # Playwright (설치된 Chrome 사용, E2E_CHANNEL=msedge 로 변경 가능)
```

요구 사항: Node >= 22, pnpm >= 10 (검증 환경: Node 26.13, pnpm 12.5). 주요 의존성: Vite 7, Vitest 4, Zod 4, React 18.

## 구성

| 경로 | 역할 |
|---|---|
| `apps/explorer` | 사용자 모바일 PWA (React·Vite·TS·Tailwind, 해시 라우팅, 정적 빌드) |
| `apps/admin` | 로컬 콘텐츠 편집기. 사용자 번들에 포함되지 않음 |
| `packages/schemas` | Zod 스키마·타입(Place·AccessPolicy·Mission·Reward 등) |
| `packages/core` | 접근 규칙·미션 엔진·체크인·보상·저장소 인터페이스·데이터 검증 |
| `packages/data` | 데모 콘텐츠(실제 데이터 아님) |
| `packages/templates` | 어드민용 빈 템플릿 |
| `tools/` | `data:validate`, `data:export`(게시된 실콘텐츠가 있으면 `--force` 없이는 덮어쓰지 않음), `data:publish` |
| `docs/` | 아키텍처·배포·QA·법적 체크리스트·코드/보안 리뷰 기록(`code-review-2026-11-19.md`, `security-review-2026-11-19.md`) |

## 데이터 게시 흐름

`어드민에서 JSON 가져오기 → 편집 → JSON 내보내기 → pnpm data:publish -- <파일>`

`data:publish`는 Zod 검증 + 의미 검증 + **공개 기준**(데모·미검증·미검수·금지 필드 차단) + diff 요약을 거친 뒤 임시 파일 → 직전본 백업(`content.prev.json`) → 원자적 교체를 수행합니다. 실패하면 기존 파일은 그대로입니다. 앱은 최신 콘텐츠가 깨지면 `content.prev.json`으로 롤백합니다.

## QA용 URL 매개변수

`#/?seed=<문자열>&now=<ISO8601>` — 난수 seed와 현재 시각을 고정합니다(예: `#/?seed=e2e-1&now=2026-11-19T10:00:00%2B09:00`). **개발 서버 또는 `VITE_ENABLE_QA_PARAMS=true`로 빌드한 경우에만 동작**하며 운영 빌드에서는 무시됩니다(`pnpm e2e`는 이 변수로 빌드).

## 환경 변수

`.env.example` 참고. 지도는 무료 OpenFreeMap(MapLibre GL JS, 키 불필요)을 기본으로 씁니다. `VITE_MAP_STYLE_URL`로 다른 벡터 스타일을 지정할 수 있으며, 바꾸면 `apps/explorer/index.html`의 CSP 도메인도 함께 수정하세요. 지도 로드에 실패하면 텍스트 안내로 대체됩니다. 외부 지도 길 안내 링크는 없습니다(2026-11-19 제거).
