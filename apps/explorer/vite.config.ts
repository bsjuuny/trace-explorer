import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";

/** 빌드 산출물 해시로 sw.js의 캐시 버전을 바꾸고, 해시된 JS/CSS를 프리캐시 목록에 넣는다. */
function swStamp(): Plugin {
  let outDir = "dist";
  return {
    name: "trace-sw-stamp",
    apply: "build",
    configResolved(c) {
      outDir = join(c.root, c.build.outDir);
    },
    closeBundle() {
      const assetsDir = join(outDir, "assets");
      const files = readdirSync(assetsDir).filter((f) => /\.(js|css)$/.test(f)).sort();
      // 빌드 ID는 번들 파일명·index.html뿐 아니라 manifest·아이콘·sw.js 템플릿 바이트도 포함한다(이들만 바뀌어도 새 캐시로 갱신).
      const hash = createHash("sha256").update(files.join("|")).update(readFileSync(join(outDir, "index.html")));
      for (const f of readdirSync(outDir).sort()) {
        if (/^(manifest\.webmanifest|sw\.js|icon.*\.(svg|png)|apple-touch-icon\.png)$/.test(f)) hash.update(f).update(readFileSync(join(outDir, f)));
      }
      const id = hash.digest("hex").slice(0, 10);
      const swPath = join(outDir, "sw.js");
      const list = JSON.stringify(files.map((f) => `./assets/${f}`));
      const template = readFileSync(swPath, "utf8");
      // 치환 대상이 없으면 조용히 넘어가지 않고 빌드를 실패시킨다(캐시 버전이 고정된 채 배포되는 것을 막는다).
      if (!template.includes("__BUILD_ID__") || !template.includes('"__PRECACHE__"')) throw new Error("sw.js에서 __BUILD_ID__/__PRECACHE__ 자리표시자를 찾지 못했습니다.");
      const sw = template.replace("__BUILD_ID__", id).replace('"__PRECACHE__"', JSON.stringify(list));
      writeFileSync(swPath, sw);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    // 카페24 하위 경로 배포를 위해 상대 경로를 기본으로 한다. 필요하면 VITE_BASE_PATH로 지정.
    base: env.VITE_BASE_PATH && env.VITE_BASE_PATH !== "/" ? env.VITE_BASE_PATH : "./",
    plugins: [react(), tailwind(), swStamp()],
    // MapLibre 6은 별도 워커 파일을 상대 경로로 읽으므로 dev 사전 번들링에서 제외한다.
    optimizeDeps: { exclude: ["maplibre-gl"] },
    // 소스맵은 공개하지 않는다.
    build: { sourcemap: false, target: "es2020" },
    server: { host: "127.0.0.1", port: 5173 },
    preview: { host: "127.0.0.1", port: 4173 },
  };
});
