import { expect, test } from "@playwright/test";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ADMIN = "http://127.0.0.1:5174/";

test("어드민: 경계 테스트(종묘형)가 모두 PASS", async ({ page }) => {
  await page.goto(ADMIN);
  await page.getByRole("tab", { name: "경계 테스트" }).click();
  await expect(page.getByRole("cell", { name: "PASS", exact: true })).toHaveCount(6);
  await expect(page.getByRole("cell", { name: "FAIL", exact: true })).toHaveCount(0);
});

test("어드민: 시뮬레이터는 제외 사유를 보여준다", async ({ page }) => {
  await page.goto(ADMIN);
  await page.getByRole("tab", { name: "미션 시뮬레이터" }).click();
  await page.getByRole("button", { name: "시뮬레이션 실행" }).click();
  await expect(page.getByText(/후보 23개/)).toBeVisible();
  await expect(page.getByRole("cell", { name: /route-unknown/ }).first()).toBeVisible();
  await expect(page.getByRole("cell", { name: /exceeds-duration/ }).first()).toBeVisible();
});

test("어드민: 공개 기준 검증은 데모 번들을 통과시키지 않는다", async ({ page }) => {
  await page.goto(ADMIN);
  await page.getByRole("tab", { name: "검증·내보내기" }).click();
  await expect(page.getByText(/구조 검증.*통과/)).toBeVisible();
  await expect(page.getByText(/공개 기준 검증.*오류/)).toBeVisible();
});

test("어드민: 잘못된 JSON 가져오기는 거부된다", async ({ page }) => {
  await page.goto(ADMIN);
  const dir = mkdtempSync(join(tmpdir(), "trace-admin-"));
  const f = join(dir, "bad.json");
  writeFileSync(f, JSON.stringify({ schemaVersion: 99 }));
  await page.locator('input[type="file"]').setInputFiles(f);
  await expect(page.getByText(/스키마 검증 실패/)).toBeVisible();
});
