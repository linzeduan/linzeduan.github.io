import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";

const localToken = "local-demo-only-token-a-minimum-32-characters";

test("diagnostic UI verifies CORS, freezes report metadata and omits tokens", async ({
  page,
}, testInfo) => {
  await page.goto("/#/diagnostics");
  await page.getByLabel("测试服务地址").fill("http://127.0.0.1:8787");
  await page.getByLabel("临时探针密钥").fill(localToken);
  await page.getByLabel("本次测试已关闭 VPN / 代理").check();
  await page.getByRole("button", { name: "开始 10 轮验证" }).click();
  await expect(
    page.getByRole("heading", { name: /本次直连检查通过/ }),
  ).toBeVisible();
  await expect(page.getByLabel("临时探针密钥")).toHaveValue("");
  await page.screenshot({
    path: `.local/screenshots/${testInfo.project.name}-network.png`,
    fullPage: true,
  });
  await page.getByLabel("当前网络").selectOption("移动网络");
  await page.getByLabel("测试者", { exact: true }).selectOption("b");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载结果" }).click();
  const download = await pending;
  const text = await readFile((await download.path())!, "utf8");
  const report = JSON.parse(text);
  expect(report).toMatchObject({
    schemaVersion: 2,
    cancelled: false,
    context: { tester: "a", network: "Wi-Fi", directConnection: true },
    assessment: { outcome: "passed", passedRequests: 30 },
  });
  expect(report.results).toHaveLength(30);
  expect(text).not.toContain(localToken);
  expect(text).not.toContain("Authorization");
  expect(text).not.toContain(await page.evaluate(() => navigator.userAgent));
});

test("diagnostics rejects a tester/key mismatch instead of certifying the wrong user", async ({
  page,
}) => {
  await page.goto("/#/diagnostics");
  await page.getByLabel("测试服务地址").fill("http://127.0.0.1:8787");
  await page.getByLabel("临时探针密钥").fill(localToken);
  await page.getByLabel("测试者", { exact: true }).selectOption("b");
  await page.getByLabel("本次测试已关闭 VPN / 代理").check();
  await page.getByRole("button", { name: "开始 10 轮验证" }).click();
  await expect(
    page.getByRole("heading", { name: /本次检查发现连接问题/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /本次直连检查通过/ }),
  ).toHaveCount(0);
});

test("stopping or leaving diagnostics aborts the in-flight request", async ({
  page,
}) => {
  let requests = 0;
  let started!: () => void;
  let observed = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route("http://127.0.0.1:8787/health", async (route) => {
    requests++;
    started();
    // Keep the request in flight until the user aborts it. No artificial sleep.
    await new Promise<void>((resolve) =>
      page.once("requestfailed", () => resolve()),
    );
    await route.abort().catch(() => {});
  });
  await page.goto("/#/diagnostics");
  await page.getByLabel("测试服务地址").fill("http://127.0.0.1:8787");
  await page.getByLabel("临时探针密钥").fill(localToken);
  await page.getByRole("button", { name: "开始 10 轮验证" }).click();
  await observed;
  const failure = page.waitForEvent("requestfailed", (r) =>
    r.url().endsWith("/health"),
  );
  await page.getByRole("button", { name: "停止检查", exact: true }).click();
  await failure;
  await expect(
    page.getByRole("heading", { name: /检查已中止，结果不完整/ }),
  ).toBeVisible();
  await expect(page.getByLabel("临时探针密钥")).toHaveValue("");
  expect(requests).toBe(1);

  observed = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.getByLabel("临时探针密钥").fill(localToken);
  await page.getByRole("button", { name: "开始 10 轮验证" }).click();
  await observed;
  const leaving = page.waitForEvent("requestfailed", (r) =>
    r.url().endsWith("/health"),
  );
  await page.getByRole("link", { name: "返回设置", exact: true }).click();
  await leaving;
  await expect(
    page.getByRole("heading", { name: "个人设置", exact: true }),
  ).toBeVisible();
  expect(requests).toBe(2);
});
