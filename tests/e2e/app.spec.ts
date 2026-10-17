import { test, expect } from "@playwright/test";
test("independent answering, unlock, comments and withdrawal", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "今天，聊一点自己" }),
  ).toBeVisible();
  await page
    .getByLabel("我的回答", { exact: true })
    .fill("A 的独立回答，喜欢一个人散步。");
  await page.getByLabel("个人私密笔记").fill("A 的私密笔记不能给 B 看见");
  await page.getByRole("button", { name: "正式提交", exact: true }).click();
  await page.getByRole("button", { name: "确认正式提交" }).click();
  await expect(page.getByText("你的答案已经准备好。")).toBeVisible();
  await page.evaluate((hash) => {
    location.hash = hash;
  }, "/settings");
  await page.getByRole("button", { name: "体验 B 的视角" }).click();
  await page.evaluate((hash) => {
    location.hash = hash;
  }, "/shared?round=today");
  await expect(page.getByText("A 的独立回答，喜欢一个人散步。")).toHaveCount(0);
  await expect(page.getByText("A 的私密笔记不能给 B 看见")).toHaveCount(0);
  await page.evaluate((hash) => {
    location.hash = hash;
  }, "/today");
  await page
    .getByLabel("我的回答", { exact: true })
    .fill("B 的独立回答，喜欢一个人听音乐。");
  await page.getByRole("button", { name: "正式提交", exact: true }).click();
  await page.getByRole("button", { name: "确认正式提交" }).click();
  await page.evaluate((hash) => {
    location.hash = hash;
  }, "/shared?round=today");
  await expect(page.getByText("A 的独立回答，喜欢一个人散步。")).toBeVisible();
  await expect(page.getByText("A 的私密笔记不能给 B 看见")).toHaveCount(0);
  await page.getByLabel("写一条留言").fill("原来我们都很喜欢独处。");
  await page.getByRole("button", { name: "留下这句话" }).click();
  await expect(page.getByText("原来我们都很喜欢独处。")).toBeVisible();
  await page.getByRole("button", { name: "撤回我的共享" }).click();
  await page.getByRole("button", { name: "撤回共享", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "这轮共享已经撤回" }),
  ).toBeVisible();
  await expect(page.getByText("A 的独立回答，喜欢一个人散步。")).toHaveCount(0);
  expect(errors).toEqual([]);
});
test("question search, private records, theme and export", async ({ page }) => {
  await page.goto("/#/archive");
  await page.getByLabel("搜索题库").fill("341");
  await expect(
    page.getByRole("heading", { name: "生理期/不舒服会好好照顾自己吗？" }),
  ).toBeVisible();
  await page
    .getByRole("heading", { name: "生理期/不舒服会好好照顾自己吗？" })
    .click();
  await expect(
    page.getByRole("heading", { name: "生理期/不舒服会好好照顾自己吗？" }),
  ).toBeVisible();
  await page.getByLabel("我的回答", { exact: true }).fill("一段演示个人记录");
  await page.evaluate((hash) => {
    location.hash = hash;
  }, "/universe");
  await page.getByLabel("搜索我的回答").fill("一段演示个人记录");
  await expect(
    page.getByText("一段演示个人记录", { exact: true }),
  ).toBeVisible();
  await page.evaluate((hash) => {
    location.hash = hash;
  }, "/settings");
  await page.getByRole("button", { name: "深色", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /导出我的数据/ }).click();
  expect((await downloadPromise).suggestedFilename()).toBe(
    "between-answers-demo-a.json",
  );
  await page.getByRole("button", { name: "浅色", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("real local D1 probe permits only authorized fixed markers", async ({
  request,
}) => {
  const health = await request.get("http://127.0.0.1:8787/health");
  expect(health.status()).toBe(200);
  const denied = await request.post("http://127.0.0.1:8787/probe");
  expect(denied.status()).toBe(401);
  const response = await request.post("http://127.0.0.1:8787/probe", {
    headers: {
      Authorization: "Bearer local-demo-only-token-a-minimum-32-characters",
    },
  });
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({
    ok: true,
    actor: "a",
    marker: "between-answers-network-probe",
  });
  expect(response.headers()["cache-control"]).toBe("no-store");
});
test("mobile and desktop rendering has no horizontal overflow", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "今天，聊一点自己" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `.local/screenshots/${testInfo.project.name}-today.png`,
    fullPage: true,
  });
  await page.evaluate((hash) => {
    location.hash = hash;
  }, "/shared?round=quiet");
  await page.screenshot({
    path: `.local/screenshots/${testInfo.project.name}-shared.png`,
    fullPage: true,
  });
});
