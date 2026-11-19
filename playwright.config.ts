import { defineConfig } from "@playwright/test";

/**
 * 설치된 Chrome 채널을 사용한다(브라우저 별도 다운로드 없음).
 * 다른 브라우저를 쓰려면 E2E_CHANNEL=msedge 처럼 지정한다.
 */
export default defineConfig({
  testDir: "./e2e",
  // 지도 테스트는 외부 타일 서버와 소프트웨어 렌더링에 의존해 시간이 들쭉날쭉하다.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    channel: process.env.E2E_CHANNEL ?? "chrome",
    // 헤드리스에서도 지도(WebGL)가 그려지도록 소프트웨어 렌더러를 허용한다.
    launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
    viewport: { width: 390, height: 844 },
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
  },
  webServer: [
    {
      command: "pnpm build && pnpm --filter @trace/explorer preview",
      env: { VITE_ENABLE_QA_PARAMS: "true" },
      url: "http://127.0.0.1:4173",
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "pnpm dev:admin",
      url: "http://127.0.0.1:5174",
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
