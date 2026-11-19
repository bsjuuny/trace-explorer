// PNG 아이콘 생성(개발 PC 전용, 결과물은 apps/explorer/public에 커밋). 사용: pnpm icons
// 설치된 Chrome으로 SVG를 렌더링한다(E2E와 같은 방식).
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const out = resolve(dirname(fileURLToPath(import.meta.url)), "../apps/explorer/public");
const BG = "#18382c";
const glyph = '<circle cx="48" cy="44" r="20" fill="none" stroke="#aee2be" stroke-width="6"/><circle cx="48" cy="44" r="6" fill="#aee2be"/><path d="M48 64v14" stroke="#aee2be" stroke-width="6" stroke-linecap="round"/>';
// any/apple: 둥근 사각 배경 포함(apple-touch-icon은 투명 불가라 정사각 꽉 채움). maskable: 안전 영역(중앙 80%) 안에 글리프.
const svgs: Record<string, [number, string]> = {
  "icon-192.png": [192, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="20" fill="${BG}"/>${glyph}</svg>`],
  "icon-512.png": [512, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="20" fill="${BG}"/>${glyph}</svg>`],
  "icon-maskable-512.png": [512, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="${BG}"/><g transform="translate(9.6 9.6) scale(0.8)">${glyph}</g></svg>`],
  "apple-touch-icon.png": [180, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="${BG}"/>${glyph}</svg>`],
};
const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL || "chrome" });
for (const [name, [size, svg]] of Object.entries(svgs)) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<body style="margin:0;background:transparent">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body>`);
  writeFileSync(resolve(out, name), await page.screenshot({ omitBackground: true, type: "png" }));
  await page.close();
  console.log("생성:", name);
}
await browser.close();
