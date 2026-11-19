import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 개발 PC 전용 편집기. 외부 인터페이스에 바인딩하지 않고, 사용자 앱(explorer) 빌드에 포함되지 않는다.
export default defineConfig({
  plugins: [react()],
  server: { host: "127.0.0.1", port: 5174, strictPort: true, allowedHosts: ["127.0.0.1", "localhost"], fs: { strict: true } },
  build: { sourcemap: false },
});
