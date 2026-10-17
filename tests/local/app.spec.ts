import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, rm, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { test, expect } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";

const password = "Local-browser-testing-password-2026";
let child: ChildProcess;
let directory: string;
const peers: BrowserContext[] = [];
async function start() {
  child = spawn(process.execPath, ["server/main.ts"], {
    stdio: "pipe",
    env: { ...process.env, BETWEEN_ANSWERS_DB: join(directory, "app.sqlite") },
  });
  child.stdout?.resume();
  child.stderr?.resume();
  await expect
    .poll(
      async () => {
        try {
          return (await fetch("http://127.0.0.1:8788/api/health")).status;
        } catch {
          return 0;
        }
      },
      { timeout: 10000 },
    )
    .toBe(200);
}
async function stop() {
  if (child?.exitCode === null) {
    const ended = new Promise<void>((done) => child.once("exit", () => done()));
    child.kill();
    await ended;
  }
}
test.beforeEach(async () => {
  await mkdir(".local", { recursive: true });
  directory = await mkdtemp(resolve(".local/local-e2e-"));
  await start();
});
test.afterEach(async () => {
  for (const peer of peers.splice(0)) await peer.close();
  await stop();
  const base = resolve(".local");
  if (
    !directory.startsWith(base + "\\local-e2e-") &&
    !directory.startsWith(base + "/local-e2e-")
  )
    throw new Error("Unsafe cleanup path");
  await rm(directory, { recursive: true, force: true });
});
async function login(page: Page, profile: "a" | "b") {
  await page.goto("/");
  await page.getByLabel("我的账号").selectOption(profile);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "让两个宇宙相遇" }),
  ).toBeVisible();
}
async function submit(page: Page) {
  await page.getByRole("button", { name: "正式提交", exact: true }).click();
  await page.getByRole("button", { name: "确认正式提交", exact: true }).click();
}

test("two isolated sessions bind, persist, unlock, discuss, withdraw and retain personal data", async ({
  page,
  browser,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByLabel("A 的称呼").fill("本地 A");
  await page.getByLabel("A 的密码").fill(password);
  await page.getByLabel("B 的称呼").fill("本地 B");
  await page.getByLabel("B 的密码").fill(password);
  await page.getByRole("button", { name: "创建本地账号" }).click();
  await login(page, "a");
  await page.getByRole("button", { name: "创建我们的空间" }).click();
  await page.getByRole("button", { name: "生成一次性邀请码" }).click();
  const code = await page.getByLabel("邀请码 · 24 小时有效").inputValue();
  const peer = await browser.newContext({
    viewport: page.viewportSize()!,
    baseURL: "http://127.0.0.1:4175",
  });
  peers.push(peer);
  const other = await peer.newPage();
  other.on("pageerror", (e) => errors.push(e.message));
  await login(other, "b");
  await other.getByLabel("对方的邀请码").fill(code);
  await other.getByRole("button", { name: "加入空间", exact: true }).click();
  await expect(
    other.getByRole("heading", { name: "今天，聊一点自己" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "今天，聊一点自己" }),
  ).toBeVisible();
  await page.getByLabel("我的回答", { exact: true }).fill("A 浏览器独立回答");
  await page.getByLabel("个人私密笔记").fill("A 只给自己的笔记");
  await expect(page.getByText("已保存在本机", { exact: true })).toBeVisible();
  await submit(page);
  const state = await (await page.request.get("/api/state")).json();
  const round = encodeURIComponent(state.todayRoundId);
  expect(
    (await other.request.get(`/api/rounds/${round}/answers/a`)).status(),
  ).toBe(403);
  expect(
    JSON.stringify(await (await other.request.get("/api/state")).json()),
  ).not.toContain("A 浏览器独立回答");
  await other.getByLabel("我的回答", { exact: true }).fill("B 浏览器独立回答");
  await other.getByLabel("个人私密笔记").fill("B 不共享的笔记");
  await submit(other);
  await page.goto("/#/shared?round=" + round);
  await expect(
    page.getByText("B 浏览器独立回答", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("B 不共享的笔记")).toHaveCount(0);
  await page.getByLabel("写一条留言").fill("想继续聊聊这份回答");
  await page.getByRole("button", { name: "留下这句话" }).click();
  await expect(
    page.getByText("想继续聊聊这份回答", { exact: true }),
  ).toBeVisible();
  await other.goto("/#/shared?round=" + round);
  await expect(
    other.getByText("想继续聊聊这份回答", { exact: true }),
  ).toBeVisible();
  await other.getByRole("button", { name: "追问", exact: true }).click();
  await other.getByLabel("写一条留言").fill("这是我的追问");
  await other.getByRole("button", { name: "留下这句话" }).click();
  await expect(other.getByText("这是我的追问", { exact: true })).toBeVisible();
  await page.screenshot({
    path: `.local/screenshots/${info.project.name}-shared.png`,
    fullPage: true,
  });
  await other.getByRole("button", { name: "撤回我的共享" }).click();
  await other.getByRole("button", { name: "撤回共享", exact: true }).click();
  await expect(
    other.getByRole("heading", { name: "这轮共享已经撤回" }),
  ).toBeVisible();
  expect(
    (await page.request.get(`/api/rounds/${round}/answers/b`)).status(),
  ).toBe(403);
  await page.goto("/#/universe");
  await expect(
    page.getByText("A 只给自己的笔记", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "历史版本", exact: true }).click();
  await expect(page.getByText("私人笔记：A 只给自己的笔记")).toBeVisible();
  await page.goto("/#/today?q=q014");
  await page.getByRole("button", { name: "发起共同问答" }).click();
  await page
    .getByRole("button", { name: "发起共同问答", exact: true })
    .last()
    .click();
  const free = await (await other.request.get("/api/state")).json();
  const invited = free.roundViews.find(
    (r: { kind: string }) => r.kind === "free",
  );
  await other.goto("/#/shared?round=" + encodeURIComponent(invited.roundId));
  await other.getByRole("button", { name: "接受这一题", exact: true }).click();
  await other
    .getByRole("button", { name: "愿意回答这一题", exact: true })
    .click();
  await expect(other.getByText("愿意一起回答这一题吗？")).toHaveCount(0);
  await page.goto("/#/settings");
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: /导出我的数据/ }).click();
  const download = await downloadEvent;
  const exported = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(
    exported.entries.some(
      (e: { text: string }) => e.text === "A 浏览器独立回答",
    ),
  ).toBe(true);
  expect(JSON.stringify(exported)).not.toContain("B 浏览器独立回答");
  await stop();
  await start();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "个人设置", exact: true }),
  ).toBeVisible();
  await page.goto("/#/universe");
  await expect(
    page.getByText("A 浏览器独立回答", { exact: true }),
  ).toBeVisible();
  await page.goto("/#/settings");
  await page.getByRole("button", { name: /解散双人空间/ }).click();
  await page.getByRole("button", { name: "确认解散", exact: true }).click();
  await page.goto("/#/universe");
  await expect(
    page.getByText("A 浏览器独立回答", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("conflicting browser draft stays intact until explicit reload", async ({
  page,
  context,
  browser,
}) => {
  const setup = await page.request.post("/api/setup", {
    data: { a: { name: "A", password }, b: { name: "B", password } },
  });
  expect(setup.status()).toBe(201);
  await page.request.post("/api/login", { data: { profile: "a", password } });
  await page.request.post("/api/spaces", { data: {} });
  const invite = await (
    await page.request.post("/api/spaces/invite", { data: {} })
  ).json();
  const peer = await browser.newContext({ baseURL: "http://127.0.0.1:4175" });
  peers.push(peer);
  await peer.request.post("/api/login", { data: { profile: "b", password } });
  await peer.request.post("/api/spaces/join", { data: { code: invite.code } });
  await page.goto("/");
  await page.getByLabel("我的回答", { exact: true }).fill("共同的旧版本");
  await expect(page.getByText("已保存在本机", { exact: true })).toBeVisible();
  const stale = await (await page.request.get("/api/state")).json();
  const second = await context.newPage();
  await second.route("**/api/state", (r) => r.fulfill({ json: stale }));
  await second.goto("/");
  await expect(second.getByLabel("我的回答", { exact: true })).toHaveValue(
    "共同的旧版本",
  );
  await page
    .getByLabel("我的回答", { exact: true })
    .fill("另一处已保存的新版本");
  await expect(page.getByText("已保存在本机", { exact: true })).toBeVisible();
  await second
    .getByLabel("我的回答", { exact: true })
    .fill("冲突中也不能丢失的草稿");
  await expect(second.getByText("存在版本冲突", { exact: true })).toBeVisible();
  await expect(second.getByLabel("我的回答", { exact: true })).toHaveValue(
    "冲突中也不能丢失的草稿",
  );
  await second.unroute("**/api/state");
  await second
    .getByRole("button", { name: "读取最新版本", exact: true })
    .click();
  await second
    .getByRole("dialog")
    .getByRole("button", { name: "读取最新版本", exact: true })
    .click();
  await expect(second.getByLabel("我的回答", { exact: true })).toHaveValue(
    "另一处已保存的新版本",
  );
});

test("failed saves and expired login preserve input; reanswers remain separate", async ({
  page,
  context,
}, info) => {
  await page.goto("/");
  await page.screenshot({
    path: `.local/screenshots/${info.project.name}-setup.png`,
    fullPage: true,
  });
  await page.request.post("/api/setup", {
    data: { a: { name: "A", password }, b: { name: "B", password } },
  });
  await page.request.post("/api/login", { data: { profile: "a", password } });
  await page.goto("/#/today?q=q014");
  await page.route("**/api/entries", (route) =>
    route.abort("connectionfailed"),
  );
  await page.reload();
  await page
    .getByLabel("我的回答", { exact: true })
    .fill("断线和登录过期也要保留的回答");
  await expect(
    page.getByText("保存失败，请重试", { exact: true }),
  ).toBeVisible();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载未同步草稿" }).click();
  const copy = JSON.parse(
    await readFile((await (await downloaded).path())!, "utf8"),
  );
  expect(copy.entry.text).toBe("断线和登录过期也要保留的回答");
  await page.unroute("**/api/entries");
  await context.clearCookies();
  await page.getByRole("button", { name: "重试保存" }).click();
  const dialog = page.getByRole("dialog", { name: "重新登录" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("密码", { exact: true }).fill(password);
  await dialog.getByRole("button", { name: "登录", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("已保存在本机", { exact: true })).toBeVisible();
  await expect(page.getByLabel("我的回答", { exact: true })).toHaveValue(
    "断线和登录过期也要保留的回答",
  );
  await page.goto("/#/universe");
  await page.getByRole("button", { name: "重答", exact: true }).click();
  await page.getByRole("button", { name: "写一份新答案" }).click();
  await expect(page.getByLabel("我的回答", { exact: true })).toHaveValue("");
  await page.getByLabel("我的回答", { exact: true }).fill("新的自己，新的回答");
  await expect(page.getByText("已保存在本机", { exact: true })).toBeVisible();
  const state = await (await page.request.get("/api/state")).json();
  expect(state.entries.map((e: { text: string }) => e.text).sort()).toEqual(
    ["断线和登录过期也要保留的回答", "新的自己，新的回答"].sort(),
  );
  await page.goto("/#/settings");
  await page.getByRole("button", { name: "深色", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: `.local/screenshots/${info.project.name}-settings-dark.png`,
    fullPage: true,
  });
});
