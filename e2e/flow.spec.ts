import { expect, test, type Page } from "@playwright/test";

const START = "/#/?seed=e2e-1&now=2026-11-19T10:00:00%2B09:00";

/** Geolocation 호출 횟수를 세고, 필요 시 지정 좌표를 돌려주는 모의 객체 */
async function installGeoSpy(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __geoCalls: number; __geoNext: { lat: number; lng: number; acc: number } | null };
    w.__geoCalls = 0;
    w.__geoNext = null;
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition(ok: (p: unknown) => void, err: (e: { code: number }) => void) {
          w.__geoCalls += 1;
          const n = w.__geoNext;
          if (!n) return err({ code: 1 });
          ok({ coords: { latitude: n.lat, longitude: n.lng, accuracy: n.acc }, timestamp: Date.now() });
        },
      },
    });
  });
}
/** 화면에 목적지가 노출되지 않으므로, 앱이 IndexedDB에 저장한 진행 중 탐험에서 장소 좌표를 읽는다. */
async function readSessionCoords(page: Page): Promise<{ lat: number; lng: number }> {
  return page.evaluate(
    () =>
      new Promise<{ lat: number; lng: number }>((resolve, reject) => {
        const open = indexedDB.open("trace-explorer");
        open.onerror = () => reject(new Error("idb"));
        open.onsuccess = () => {
          const get = open.result.transaction("kv", "readonly").objectStore("kv").get("session");
          get.onsuccess = () => {
            const c = (get.result as { place: { coordinates: { lat: number; lng: number } } } | undefined)?.place.coordinates;
            if (c) resolve(c);
            else reject(new Error("no session"));
          };
          get.onerror = () => reject(new Error("get"));
        };
      }),
  );
}
const geoCalls = (page: Page) => page.evaluate(() => (window as unknown as { __geoCalls: number }).__geoCalls);

async function acceptConsent(page: Page, location: boolean) {
  await page.getByLabel(/\(필수\)/).check();
  if (location) await page.getByLabel(/\(선택\)/).check();
  await page.getByRole("button", { name: "동의하고 시작" }).click();
  await expect(page.getByRole("heading", { name: "오늘의 미스터리" })).toBeVisible();
}

test("선택 동의는 기본 미선택이고, 필수 확인 전에는 시작할 수 없다", async ({ page }) => {
  await installGeoSpy(page);
  await page.goto(START);
  await expect(page.getByRole("heading", { name: "시작하기 전에" })).toBeVisible();
  await expect(page.getByLabel(/\(선택\)/)).not.toBeChecked();
  await expect(page.getByRole("button", { name: "동의하고 시작" })).toBeDisabled();
  expect(await geoCalls(page)).toBe(0);
});

test("위치 버튼을 누르기 전에는 브라우저 위치 요청이 없고, 거부하면 수동 출발점으로 데모가 된다", async ({ page }) => {
  await installGeoSpy(page);
  await page.goto(START);
  await acceptConsent(page, true);
  expect(await geoCalls(page)).toBe(0);
  await page.getByRole("button", { name: "내 위치로 탐험" }).click();
  await expect(page.getByRole("status").filter({ hasText: "거부되어" })).toBeVisible();
  expect(await geoCalls(page)).toBeGreaterThan(0);
  await expect(page.getByText("출발점: 종로5가역(수동 선택)")).toBeVisible();
  await page.getByRole("button", { name: "탐험 시작" }).click();
  await expect(page.getByRole("heading", { name: "단서를 따라가 보세요" })).toBeVisible();
});

test("브라우저 위치가 해외(VPN·IP 추정)로 나오면 사용하지 않고 종로5가역에서 시작한다", async ({ page }) => {
  await installGeoSpy(page);
  await page.goto(START);
  await acceptConsent(page, true);
  await page.evaluate(() => {
    (window as unknown as { __geoNext: unknown }).__geoNext = { lat: 51.5074, lng: -0.1278, acc: 50 };
  });
  await page.getByRole("button", { name: "내 위치로 탐험" }).click();
  await expect(page.getByRole("status").filter({ hasText: "떨어져 있어요" })).toContainText("VPN");
  await expect(page.getByText("출발점: 종로5가역(수동 선택)")).toBeVisible();
});

test("종로5가 인근 위치는 내 위치 출발점으로 사용한다", async ({ page }) => {
  await installGeoSpy(page);
  await page.goto(START);
  await acceptConsent(page, true);
  await page.evaluate(() => {
    (window as unknown as { __geoNext: unknown }).__geoNext = { lat: 37.5715, lng: 126.999, acc: 25 };
  });
  await page.getByRole("button", { name: "내 위치로 탐험" }).click();
  await expect(page.getByText("출발점: 내 위치")).toBeVisible();
});

test("위치 동의 없이: 단서 → 기록만 저장 → 도감(미인증), 체크인은 꺼져 있다", async ({ page }) => {
  await installGeoSpy(page);
  await page.goto(START);
  await acceptConsent(page, false);
  await expect(page.getByText("[데모]").first()).toBeHidden();
  await page.getByRole("button", { name: "탐험 시작" }).click();
  await expect(page.getByRole("list", { name: "단서 목록" }).getByRole("listitem")).toHaveCount(1);
  await page.getByRole("button", { name: "다음 단서" }).click();
  await page.getByRole("button", { name: "다음 단서" }).click();
  await expect(page.getByRole("list", { name: "단서 목록" }).getByRole("listitem")).toHaveCount(3);
  await expect(page.getByRole("button", { name: /도착했어요/ })).toHaveCount(0);
  await expect(page.getByText("현장 체크인이 꺼져 있어요")).toBeVisible();
  await page.getByRole("button", { name: /기록만 저장/ }).click();
  await expect(page.getByRole("heading", { name: "발견했어요!" })).toBeVisible();
  await expect(page.getByText("데모 콘텐츠(실제 장소 아님)")).toBeVisible();
  await page.getByRole("button", { name: "도감 보기" }).click();
  await expect(page.getByText("미인증")).toBeVisible();
  expect(await geoCalls(page)).toBe(0);
});

test("현장 체크인: 먼 위치는 실패, 장소 좌표에서는 성공하고 XP가 지급된다", async ({ page }) => {
  await installGeoSpy(page);
  await page.goto(START);
  await acceptConsent(page, true);
  await page.getByRole("button", { name: "탐험 시작" }).click();
  await expect(page.getByRole("heading", { name: "단서를 따라가 보세요" })).toBeVisible();
  const { lat, lng } = await readSessionCoords(page);

  // 멀리 있는 위치 -> 실패
  await page.evaluate(([la, ln]) => {
    (window as unknown as { __geoNext: unknown }).__geoNext = { lat: la! + 0.01, lng: ln!, acc: 10 };
  }, [lat, lng]);
  await page.getByRole("button", { name: /도착했어요/ }).click();
  await expect(page.getByRole("alert").filter({ hasText: "멀어요" })).toBeVisible();

  // 저정확도 -> 실패
  await page.evaluate(([la, ln]) => {
    (window as unknown as { __geoNext: unknown }).__geoNext = { lat: la!, lng: ln!, acc: 500 };
  }, [lat, lng]);
  await page.getByRole("button", { name: /도착했어요/ }).click();
  await expect(page.getByRole("alert").filter({ hasText: "정확도가 낮아요" })).toBeVisible();

  // 정상 -> 성공
  await page.evaluate(([la, ln]) => {
    (window as unknown as { __geoNext: unknown }).__geoNext = { lat: la!, lng: ln!, acc: 10 };
  }, [lat, lng]);
  await page.getByRole("button", { name: /도착했어요/ }).click();
  await expect(page.getByRole("heading", { name: "발견했어요!" })).toBeVisible();
  await expect(page.getByText(/획득 XP/)).toContainText("100");
});

test("새로고침해도 진행 중 탐험이 복구된다", async ({ page }) => {
  await page.goto(START);
  await acceptConsent(page, false);
  await page.getByRole("button", { name: "탐험 시작" }).click();
  await page.getByRole("button", { name: "다음 단서" }).click();
  await expect(page.getByRole("list", { name: "단서 목록" }).getByRole("listitem")).toHaveCount(2);
  await page.reload();
  await page.goto("/#/mission?seed=e2e-1&now=2026-11-19T10:00:00%2B09:00");
  await expect(page.getByRole("list", { name: "단서 목록" }).getByRole("listitem")).toHaveCount(2);
});

test("내 기록 삭제는 실제 로컬 데이터를 지우고 동의 화면으로 돌아간다", async ({ page }) => {
  await page.goto(START);
  await acceptConsent(page, false);
  await page.getByRole("link", { name: "설정" }).click();
  await page.getByRole("button", { name: "내 기록 모두 삭제" }).click();
  await page.getByRole("button", { name: "정말 삭제" }).click();
  await expect(page.getByRole("heading", { name: "시작하기 전에" })).toBeVisible();
  const dbs = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
  expect(dbs).not.toContain("trace-explorer");
});

test("지도: 끌어서 이동·확대·출발점 복귀가 되고, 목적지는 지도에 표시되지 않는다", async ({ page }) => {
  await page.goto(START);
  await acceptConsent(page, false);
  await page.getByRole("button", { name: "탐험 시작" }).click();
  const map = page.getByTestId("map");
  // 외부 타일 서버(OpenFreeMap)에서 스타일·타일을 받아 첫 렌더가 끝날 때까지 대기
  await expect(map).toHaveAttribute("data-center", /.+/, { timeout: 30_000 });
  await expect(page.locator(".maplibregl-marker")).toHaveCount(1);
  const c0 = await map.getAttribute("data-center");
  const z0 = Number(await map.getAttribute("data-zoom"));

  const bb = (await map.boundingBox())!;
  const cx = bb.x + bb.width / 2;
  const cy = bb.y + bb.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx - 120, cy + 60, { steps: 10 });
  await page.mouse.up();
  await expect(map).not.toHaveAttribute("data-center", c0!);

  await page.mouse.move(cx, cy);
  await page.mouse.wheel(0, -400);
  await expect.poll(async () => Number(await map.getAttribute("data-zoom"))).toBeGreaterThan(z0);

  await page.getByRole("button", { name: "출발점으로" }).click();
  await expect(map).toHaveAttribute("data-center", c0!, { timeout: 10_000 });

  // 목적지는 비공개이며 마커는 출발점 하나뿐이다. 지도와 동등한 텍스트 안내도 유지된다.
  await expect(page.locator(".maplibregl-marker")).toHaveCount(1);
  const text = page.getByRole("list", { name: "지도와 같은 내용의 텍스트 안내" });
  await expect(text).toContainText("목적지: 비공개");
  await expect(text).not.toContainText("[데모]");
});

test("길 안내·목적지 카드와 외부 지도 링크는 없고, 탐험 종료 때 목적지가 공개된다", async ({ page }) => {
  await page.goto(START);
  await acceptConsent(page, false);
  await page.getByRole("button", { name: "탐험 시작" }).click();
  await expect(page.getByRole("button", { name: "탐험 종료" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "길 안내 · 목적지" })).toHaveCount(0);
  await expect(page.locator('a[href*="map.kakao.com"]')).toHaveCount(0);
  await page.getByRole("button", { name: "탐험 종료" }).click();
  await expect(page.getByRole("heading", { name: "탐험을 종료했어요" })).toBeVisible();
  await expect(page.getByText(/목적지는 .*\[데모\]/)).toBeVisible();
});
