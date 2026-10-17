import { test, expect } from "@playwright/test";
test("root PWA assets and legacy cache migration", async ({
  page,
  request,
}) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.status()).toBe(200);
  const manifest = await response.json();
  expect(manifest).toMatchObject({
    start_url: "/",
    scope: "/",
    display: "standalone",
  });
  for (const icon of manifest.icons) {
    const image = await request.get(icon.src);
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toContain("image/png");
  }
  await page.goto("/favicon.svg");
  await page.evaluate(async () => {
    await caches.open("zhongxiang-guide-core-v4");
    await caches.open("unrelated-keep-me");
  });
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          !(await caches.keys()).some((key) =>
            key.startsWith("zhongxiang-guide-"),
          ),
      ),
    )
    .toBe(true);
  expect(
    await page.evaluate(async () =>
      (await caches.keys()).includes("unrelated-keep-me"),
    ),
  ).toBe(true);
  await page
    .getByLabel("我的回答", { exact: true })
    .fill("不得进入 CacheStorage 的合成答案");
  const cached = await page.evaluate(async () => {
    const values = [];
    for (const key of await caches.keys()) {
      const cache = await caches.open(key);
      values.push(...(await cache.keys()).map((r) => r.url));
    }
    return values;
  });
  expect(cached).toEqual([]);
});
