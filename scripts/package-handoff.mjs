import { spawnSync } from "node:child_process";
import { readFile, readdir, mkdir, writeFile, lstat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { zipSync, unzipSync, strToU8 } from "fflate";

function git(args, binary = false) {
  const result = spawnSync("git", args, {
    encoding: binary ? undefined : "utf8",
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error("Git 读取失败，未打包。");
  return result.stdout;
}
if (git(["status", "--porcelain"]).trim())
  throw new Error("请先提交当前产品版本，再生成交接包。");
const commit = git(["rev-parse", "HEAD"]).trim();
const { version } = JSON.parse(git(["show", `${commit}:package.json`]));
const built = spawnSync(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "build"],
  { stdio: "inherit", env: { ...process.env, VITE_APP_MODE: "demo" } },
);
if (built.status !== 0) throw new Error("演示构建失败，未打包。");
if (
  git(["status", "--porcelain"]).trim() ||
  git(["rev-parse", "HEAD"]).trim() !== commit
)
  throw new Error("构建期间源码版本发生变化，请重新生成交接包。");
const entries = {};
const source = unzipSync(git(["archive", "--format=zip", commit], true));
for (const [path, bytes] of Object.entries(source)) {
  if (
    /(^|\/)(?:\.local|node_modules|exports|\.git)(?:\/|$)|\.sqlite(?:-|$)|\.docx$/i.test(
      path,
    ) ||
    (/(^|\/)\.env(?:$|\.)/.test(path) && !path.endsWith(".env.example")) ||
    (/(^|\/)\.dev\.vars(?:$|\.)/.test(path) &&
      !path.endsWith(".dev.vars.example"))
  )
    throw new Error("源码归档包含非交接文件，已停止。");
  entries[`source/${path}`] = bytes;
}
async function preview(directory, prefix = "preview") {
  for (const name of await readdir(directory)) {
    const path = join(directory, name);
    const info = await lstat(path);
    if (info.isSymbolicLink()) throw new Error("演示目录含符号链接，未打包。");
    if (info.isDirectory()) await preview(path, `${prefix}/${name}`);
    else entries[`${prefix}/${name}`] = new Uint8Array(await readFile(path));
  }
}
await preview("dist");
entries["HANDOFF.md"] = strToU8(
  `# 答案之间 产品交接包\n\n版本 ${version}，提交 ${commit}。\n\n- source/：已提交的完整源码、页面设计、19 张合成数据预览图、接口与验收说明。\n- preview/：可上传到静态站点的演示资源，使用合成内容，不是私人云服务。\n- 先读 source/docs/HANDOFF_WORK_BUDDY.md，再按 source/docs/API_CONTRACT.md 接入已有云资源。\n\n域名、云数据库和正式部署由 Work Buddy 负责。前端采用同域 /api；上传演示资源不等于已完成私人数据接入。生产前按交接文档验证认证、服务端双向解锁与真机网络。\n\n此包不包含私人数据库、真实答案、原始 DOCX、导出、账号凭证或 node_modules。\n`,
);
entries["BUILD.json"] = strToU8(
  JSON.stringify(
    {
      version,
      commit,
      appMode: "demo",
      createdAt: new Date().toISOString(),
      sourceFiles: Object.keys(source).length,
    },
    null,
    2,
  ),
);
const directory = resolve(".local/handoff");
await mkdir(directory, { recursive: true });
const output = join(
  directory,
  `between-answers-${version}-${commit.slice(0, 8)}.zip`,
);
await writeFile(output, zipSync(entries, { level: 6 }), { flag: "wx" });
console.log(`交接包已生成：${output}`);
