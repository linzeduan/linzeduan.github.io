// Captures only the isolated in-memory demo; never connects to a user database.
import { spawn } from "node:child_process";
import { mkdir, copyFile } from "node:fs/promises";
import { chromium, devices, expect } from "@playwright/test";

const output = "docs/design";
await mkdir(output, { recursive: true });
const child = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    "4177",
    "--strictPort",
  ],
  {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, VITE_APP_MODE: "demo" },
  },
);
let browser;
try {
  await new Promise((ready, reject) => {
    let output = "";
    const timer = setTimeout(
      () => finish(new Error("设计预览服务未启动，请检查 4177 端口。")),
      15000,
    );
    const finish = (error) => {
      clearTimeout(timer);
      child.stdout.off("data", receive);
      child.off("exit", exited);
      child.off("error", failed);
      error ? reject(error) : ready();
    };
    const receive = (data) => {
      output += data;
      if (output.includes("http://127.0.0.1:4177")) finish();
    };
    const exited = () =>
      finish(new Error("设计预览服务启动失败，不复用现有服务。"));
    const failed = (error) => finish(error);
    child.stdout.on("data", receive);
    child.once("exit", exited);
    child.once("error", failed);
    child.stderr.resume();
  });
  child.stdout.resume();
  browser = await chromium.launch();
  for (const [name, device] of [
    ["desktop", devices["Desktop Chrome"]],
    ["mobile", devices["iPhone 13"]],
  ]) {
    const context = await browser.newContext({
      ...device,
      deviceScaleFactor: name === "mobile" ? 2 : 1,
      colorScheme: "light",
      baseURL: "http://127.0.0.1:4177",
    });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.locator(".demo-banner")).toContainText("演示预览");
    await page.evaluate(async () => {
      const { demoJournal: repo } = await import("/src/data/mock/journal.ts");
      repo.reset();
      repo.save(
        "a",
        "q057",
        "我喜欢一个人散步。走到熟悉的路口，偶尔换一个方向，不急着到哪里。\n\n回家后读几页书，给自己做一顿简单的晚饭。平凡的一天，也可以过得很完整。",
        "最近发现，不把每一刻排满，反而更能听见自己的想法。",
        0,
      );
    });
    const capture = async (file, route, fullPage = true) => {
      await page.goto(route);
      await expect(page.locator("#main-content h1").first()).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.evaluate(
        () =>
          new Promise((done) =>
            requestAnimationFrame(() => requestAnimationFrame(done)),
          ),
      );
      if (
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        )
      )
        throw new Error(`页面横向溢出：${file}`);
      await page.screenshot({
        path: `${output}/${name}-${file}.png`,
        fullPage: name === "mobile" ? false : fullPage,
      });
    };
    await capture("today", "/#/today");
    if (name === "mobile") {
      await page
        .locator(".writing-card")
        .evaluate((element) =>
          element.scrollIntoView({ block: "start", behavior: "instant" }),
        );
      await page.screenshot({
        path: `${output}/mobile-writing.png`,
        fullPage: false,
      });
    }
    await page.evaluate(async () => {
      const { demoJournal: repo } = await import("/src/data/mock/journal.ts");
      repo.submit(
        "a",
        "today",
        repo.snapshot("a").entries.find((e) => e.questionId === "q057").text,
      );
    });
    await capture("waiting", "/#/shared?round=today");
    await page.evaluate(async () => {
      const { demoJournal: repo } = await import("/src/data/mock/journal.ts");
      const text =
        "我会听一张完整的专辑，不跳过任何一首。也喜欢去菜市场慢慢逛一圈，看看今天有什么新鲜的。\n\n一个人的时候，好像更容易留意生活里细小的变化。";
      repo.save("b", "q057", text, "这条合成笔记只属于 B。", 0);
      repo.submit("b", "today", text);
      repo.comment(
        "b",
        "today",
        "你说的“不急着到哪里”，我很喜欢。下次也想试试走一条不熟悉的路。",
      );
      repo.comment("a", "today", "有时候换个方向，真的会遇见不一样的风景。");
    });
    await capture("shared", "/#/shared?round=today");
    await capture("universe", "/#/universe");
    await capture("archive", "/#/archive", false);
    await page.goto("/#/settings");
    await page.getByRole("button", { name: "深色", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await capture("settings-dark", "/#/settings");
    await context.close();
    for (const state of ["setup", "login", "midnight"])
      await copyFile(
        `.local/screenshots/local-${name}-${state}.png`,
        `${output}/${name}-${state}.png`,
      );
  }
  console.log("Generated 19 synthetic product screenshots in docs/design.");
} finally {
  await browser?.close();
  if (child.pid && child.exitCode === null && child.signalCode === null) {
    const ended = new Promise((done) => child.once("exit", done));
    child.kill();
    await ended;
  }
}
