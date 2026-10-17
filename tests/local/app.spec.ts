import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  rm,
  readFile,
  writeFile,
  rename,
} from "node:fs/promises";
import { resolve, join } from "node:path";
import { test, expect } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";

const password = "Local-browser-testing-password-2026";
const apiPort = 8789;
let child: ChildProcess;
let directory: string;
const peers: BrowserContext[] = [];
async function start(clock?: string) {
  child = spawn(
    process.execPath,
    [clock ? "tests/local/clock-server.ts" : "server/main.ts"],
    {
      stdio: "pipe",
      env: {
        ...process.env,
        BETWEEN_ANSWERS_DB: join(directory, "app.sqlite"),
        BETWEEN_ANSWERS_PORT: String(apiPort),
        ...(clock ? { BETWEEN_ANSWERS_TEST_CLOCK: clock } : {}),
      },
    },
  );
  await new Promise<void>((ready, reject) => {
    let output = "";
    const timer = setTimeout(
      () => done(new Error("Owned test API did not start")),
      10000,
    );
    const done = (error?: Error) => {
      clearTimeout(timer);
      child.stdout?.off("data", receive);
      child.off("exit", exited);
      child.off("error", failed);
      if (error) reject(error);
      else ready();
    };
    const receive = (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes(`Local API ready at http://127.0.0.1:${apiPort}`))
        done();
    };
    const exited = (code: number | null) =>
      done(
        new Error(
          `Owned test API exited (${code}); refusing to reuse another service`,
        ),
      );
    const failed = (error: Error) => done(error);
    child.stdout?.on("data", receive);
    child.once("exit", exited);
    child.once("error", failed);
  });
  child.stdout?.resume();
  child.stderr?.resume();
  await expect
    .poll(
      async () => {
        try {
          return (await fetch(`http://127.0.0.1:${apiPort}/api/health`)).status;
        } catch {
          return 0;
        }
      },
      { timeout: 10000 },
    )
    .toBe(200);
}
async function stop() {
  if (child?.pid && child.exitCode === null && child.signalCode === null) {
    const ended = new Promise<void>((done) => child.once("exit", () => done()));
    child.kill();
    await ended;
  }
}
async function setTestClock(value: string) {
  const target = resolve(directory, "clock.txt");
  const staging = resolve(directory, "next-clock.txt");
  if (
    !target.startsWith(resolve(".local") + "\\local-e2e-") &&
    !target.startsWith(resolve(".local") + "/local-e2e-")
  )
    throw new Error("Unsafe clock path");
  await writeFile(staging, value, "utf8");
  await rename(staging, target);
  return target;
}
test.beforeEach(async () => {
  await mkdir(".local", { recursive: true });
  directory = await mkdtemp(resolve(".local/local-e2e-"));
  await start();
});
test.afterEach(async () => {
  try {
    await Promise.all(peers.splice(0).map((peer) => peer.close()));
  } finally {
    await stop();
    const base = resolve(".local");
    if (
      !directory.startsWith(base + "\\local-e2e-") &&
      !directory.startsWith(base + "/local-e2e-")
    )
      throw new Error("Unsafe cleanup path");
    await rm(directory, { recursive: true, force: true });
  }
});
async function login(page: Page, profile: "a" | "b") {
  await page.goto("/");
  await page.getByLabel("我的账号").selectOption(profile);
  if (profile === "a")
    await page.screenshot({
      path: `.local/screenshots/${test.info().project.name}-login.png`,
      fullPage: true,
    });
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

async function seedUnlocked(page: Page, peer: BrowserContext) {
  const setup = await page.request.post("/api/setup", {
    data: { a: { name: "A", password }, b: { name: "B", password } },
  });
  expect(setup.status()).toBe(201);
  expect(
    (
      await page.request.post("/api/login", {
        data: { profile: "a", password },
      })
    ).status(),
  ).toBe(200);
  await page.request.post("/api/spaces", { data: {} });
  const invite = await (
    await page.request.post("/api/spaces/invite", { data: {} })
  ).json();
  await peer.request.post("/api/login", { data: { profile: "b", password } });
  await peer.request.post("/api/spaces/join", { data: { code: invite.code } });
  const state = await (await page.request.get("/api/state")).json();
  await seedAnswers(page, peer, state.todayRoundId, state.todayQuestionId);
  return state.todayRoundId as string;
}
async function seedAnswers(
  page: Page,
  peer: BrowserContext,
  roundId: string,
  questionId: string,
) {
  for (const [client, answer] of [
    [page.request, "A shared answer"],
    [peer.request, "B shared answer"],
  ] as const) {
    const id = crypto.randomUUID();
    expect(
      (
        await client.post("/api/entries", {
          data: {
            id,
            questionId,
            roundId,
            text: answer,
            note: "private note",
            expectedRevision: 0,
          },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await client.post(`/api/rounds/${encodeURIComponent(roundId)}/submit`, {
          data: {
            entryId: id,
            expectedRevision: 1,
            operationId: crypto.randomUUID(),
          },
        })
      ).status(),
    ).toBe(200);
  }
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
    page.locator(".comment").getByText("想继续聊聊这份回答", { exact: true }),
  ).toBeVisible();
  await other.goto("/#/shared?round=" + round);
  await expect(
    other.locator(".comment").getByText("想继续聊聊这份回答", { exact: true }),
  ).toBeVisible();
  await other.getByRole("button", { name: "追问", exact: true }).click();
  await other.getByLabel("写一条留言").fill("这是我的追问");
  await other.getByRole("button", { name: "留下这句话" }).click();
  await expect(
    other.locator(".comment").getByText("这是我的追问", { exact: true }),
  ).toBeVisible();
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
  await page.route("**/api/entries/*/revisions", (route) =>
    route.abort("connectionfailed"),
  );
  await page.getByRole("link", { name: "历史版本", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "重试读取历史" }),
  ).toBeVisible();
  await page.unroute("**/api/entries/*/revisions");
  await page.getByRole("button", { name: "重试读取历史" }).click();
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

test("comment retries stay unique, later typing survives, and incoming rounds do not move the draft", async ({
  page,
  browser,
}) => {
  const peer = await browser.newContext({ baseURL: "http://127.0.0.1:4175" });
  peers.push(peer);
  const roundId = await seedUnlocked(page, peer);
  await page.goto("/#/shared");
  await expect(
    page.getByText("B shared answer", { exact: true }),
  ).toBeVisible();
  const originalQuestion = await page
    .locator(".shared-question h2")
    .innerText();
  const commentsPath = "**/api/rounds/*/comments";
  let rejectReads = false;
  let firstWrite = true;
  await page.route("**/api/state", async (route) => {
    if (rejectReads) await route.abort("connectionfailed");
    else await route.continue();
  });
  await page.route(commentsPath, async (route) => {
    const response = await route.fetch();
    if (firstWrite) {
      rejectReads = true;
      firstWrite = false;
    }
    await route.fulfill({ response });
  });
  await page.getByLabel("写一条留言").fill("只应保存一次的留言");
  await page.getByRole("button", { name: "留下这句话" }).click();
  await expect(
    page.getByRole("heading", { name: "连接恢复后，再打开答案" }),
  ).toBeVisible();
  rejectReads = false;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(
    page.locator(".comment").getByText("只应保存一次的留言", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("写一条留言")).toHaveValue("只应保存一次的留言");
  await page.getByRole("button", { name: "留下这句话" }).click();
  await expect(page.getByLabel("写一条留言")).toHaveValue("");
  const synced = await (await page.request.get("/api/state")).json();
  expect(
    synced.roundViews.find((r: { roundId: string }) => r.roundId === roundId)
      .comments,
  ).toHaveLength(1);
  await page.unroute("**/api/state");
  await page.unroute(commentsPath);

  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(commentsPath, async (route) => {
    await pending;
    await route.continue();
  });
  await page.getByLabel("写一条留言").fill("正在发送的这一条");
  await page.getByRole("button", { name: "留下这句话" }).click();
  try {
    await expect(
      page.getByRole("button", { name: "正在留下…" }),
    ).toBeDisabled();
    await page.getByLabel("写一条留言").fill("发送过程中继续写的下一条");
  } finally {
    release();
  }
  await expect(
    page.getByText("正在发送的这一条", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("写一条留言")).toHaveValue(
    "发送过程中继续写的下一条",
  );
  await page.unroute(commentsPath);

  const created = await (
    await page.request.post("/api/rounds/free", {
      data: { questionId: "q014", sensitiveConsent: false },
    })
  ).json();
  expect(
    (
      await peer.request.post(`/api/rounds/${created.id}/accept`, { data: {} })
    ).status(),
  ).toBe(200);
  await seedAnswers(page, peer, created.id, "q014");
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.locator(".round-tabs a")).toHaveCount(2);
  await expect(page.locator(".shared-question h2")).toHaveText(
    originalQuestion,
  );
  await expect(page.getByLabel("写一条留言")).toHaveValue(
    "发送过程中继续写的下一条",
  );
  await page.goto("/#/shared?round=unavailable-round");
  await expect(
    page.getByRole("heading", { name: "暂时无法打开这轮问答" }),
  ).toBeVisible();
  await expect(page.getByText("B shared answer", { exact: true })).toHaveCount(
    0,
  );
});

test("Shanghai midnight keeps the current answer attached to its original day", async ({
  page,
  browser,
}) => {
  await stop();
  const clock = await setTestClock("2026-10-17T15:59:58Z");
  await start(clock);
  const peer = await browser.newContext({ baseURL: "http://127.0.0.1:4175" });
  peers.push(peer);
  const originalRound = await seedUnlocked(page, peer);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "今天，聊一点自己" }),
  ).toBeVisible();
  const originalQuestion = await page.locator("#question-title").innerText();
  await page
    .getByLabel("我的回答", { exact: true })
    .fill("跨过零点也属于原来这一题的回答");
  await expect(page.getByText("已保存在本机", { exact: true })).toBeVisible();
  await setTestClock("2026-10-17T16:00:01Z");
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(
    page.getByRole("link", { name: "打开今日问题", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#question-title")).toHaveText(originalQuestion);
  await expect(page.getByLabel("我的回答", { exact: true })).toHaveValue(
    "跨过零点也属于原来这一题的回答",
  );
  await expect(page.locator(".page-footnote")).toContainText("10月17日");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: `.local/screenshots/${test.info().project.name}-midnight.png`,
    fullPage: !test.info().project.name.includes("mobile"),
  });
  await page
    .getByLabel("我的回答", { exact: true })
    .fill("零点之后继续写，仍不改变所属题目");
  await expect(page.getByText("已保存在本机", { exact: true })).toBeVisible();
  const state = await (await page.request.get("/api/state")).json();
  expect(state.serverDay).toBe("2026-10-18");
  expect(state.todayRoundId).not.toBe(originalRound);
  expect(
    state.entries.find((e: { roundId?: string }) => e.roundId === originalRound)
      .text,
  ).toBe("零点之后继续写，仍不改变所属题目");
  expect(
    state.entries.some(
      (e: { roundId?: string }) => e.roundId === state.todayRoundId,
    ),
  ).toBe(false);
  await page.getByRole("link", { name: "打开今日问题", exact: true }).click();
  await expect(page.locator("#question-title")).not.toHaveText(
    originalQuestion,
  );
  await expect(page.getByLabel("我的回答", { exact: true })).toHaveValue("");
  await setTestClock("2028-01-01T04:00:00Z");
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  const reauth = page.getByRole("dialog", { name: "重新登录" });
  await expect(reauth).toBeVisible();
  await reauth.getByLabel("密码", { exact: true }).fill(password);
  await reauth.getByRole("button", { name: "登录", exact: true }).click();
  await expect(reauth).not.toBeVisible();
  await page.goto("/#/today");
  await expect(
    page.getByRole("heading", { name: "推荐日程已经走完" }),
  ).toBeVisible();
  await expect(page.getByLabel("我的回答", { exact: true })).toHaveCount(0);
});

test("a private answer becomes an independent invitation draft without sharing its notes", async ({
  page,
  browser,
}) => {
  const peer = await browser.newContext({ baseURL: "http://127.0.0.1:4175" });
  peers.push(peer);
  const sharedRoundId = await seedUnlocked(page, peer);
  await page.goto("/#/today?q=q014");
  await page.getByLabel("我的回答", { exact: true }).fill("已经写好的私人回答");
  await page.getByLabel("个人私密笔记").fill("复制后仍仅自己可见的笔记");
  await expect(page.getByText("已保存在本机", { exact: true })).toBeVisible();
  const before = await (await page.request.get("/api/state")).json();
  const original = before.entries.find(
    (e: { questionId: string }) => e.questionId === "q014",
  );
  await page.getByRole("button", { name: "发起共同问答", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "发起共同问答", exact: true })
    .click();
  await expect(page.getByLabel("我的回答", { exact: true })).toHaveValue(
    "已经写好的私人回答",
  );
  await expect(page.getByLabel("个人私密笔记")).toHaveValue(
    "复制后仍仅自己可见的笔记",
  );
  const after = await (await page.request.get("/api/state")).json();
  const created = after.roundViews.find(
    (r: { kind: string }) => r.kind === "free",
  );
  expect(
    after.entries.filter(
      (e: { questionId: string }) => e.questionId === "q014",
    ),
  ).toHaveLength(2);
  expect(
    after.entries.find((e: { id: string }) => e.id === original.id),
  ).toMatchObject({
    text: original.text,
    note: original.note,
    revision: original.revision,
  });
  const otherState = await (await peer.request.get("/api/state")).json();
  expect(JSON.stringify(otherState)).not.toContain("已经写好的私人回答");
  expect(JSON.stringify(otherState)).not.toContain("复制后仍仅自己可见的笔记");
  expect(
    (
      await peer.request.get(`/api/rounds/${created.roundId}/answers/a`)
    ).status(),
  ).toBe(403);
  await page
    .getByLabel("我的回答", { exact: true })
    .fill("只修改新轮草稿，原来的回答保留");
  await expect(page.getByText("已保存在本机", { exact: true })).toBeVisible();
  expect(
    (await (await page.request.get(`/api/entries/${original.id}`)).json()).text,
  ).toBe("已经写好的私人回答");
  await page.goto(`/#/today?q=q057&entry=${original.id}`);
  await expect(
    page.getByRole("heading", { name: "暂时无法打开这份回答" }),
  ).toBeVisible();
  await expect(page.getByLabel("我的回答", { exact: true })).toHaveCount(0);
  expect(
    (
      await page.request.post(
        `/api/rounds/${encodeURIComponent(sharedRoundId)}/withdraw`,
        { data: {} },
      )
    ).status(),
  ).toBe(200);
  await page.goto(`/#/today?q=q057&round=${encodeURIComponent(sharedRoundId)}`);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page
    .getByRole("button", { name: "重新发起共同问答", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "发起共同问答", exact: true })
    .click();
  await expect(page.getByLabel("我的回答", { exact: true })).toHaveValue(
    "A shared answer",
  );
  expect(
    (
      await peer.request.get(
        `/api/rounds/${encodeURIComponent(sharedRoundId)}/answers/a`,
      )
    ).status(),
  ).toBe(403);
});
