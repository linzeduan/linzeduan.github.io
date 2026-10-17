import {
  createBackup,
  verifyBackup,
  restoreBackup,
} from "../server/local-backup.ts";
import { emitKeypressEvents } from "node:readline";

function hiddenPassword(label) {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error(
      "恢复需要交互终端输入新密码，请直接在本机终端运行；不要把密码写进命令参数。",
    );
  process.stdout.write(label);
  emitKeypressEvents(process.stdin);
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (error) => {
      process.stdin.off("keypress", receive);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
      value = "";
    };
    const receive = (text, key = {}) => {
      if (key.ctrl && key.name === "c") finish(new Error("已取消恢复。"));
      else if (key.name === "return" || key.name === "enter") finish();
      else if (key.name === "backspace")
        value = [...value].slice(0, -1).join("");
      else if (
        text &&
        !key.ctrl &&
        !key.meta &&
        !/[\u0000-\u001f\u007f]/.test(text)
      )
        value += text;
    };
    process.stdin.setRawMode(true);
    process.stdin.on("keypress", receive);
    process.stdin.resume();
  });
}
async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "--help" || !command) {
    console.log(
      "backup [--db 文件] [--out 目录]\nverify <备份目录>\nrestore <备份目录> [--out 目录]\n默认只在 .local 下新建文件，不覆盖现有数据库。恢复会关闭旧共享、清除会话并要求设置新密码。",
    );
    return;
  }
  if (!["backup", "verify", "restore"].includes(command))
    throw new Error("未知操作，请使用 --help。");
  const options = {};
  let directory;
  for (let i = 0; i < args.length; i++) {
    const value = args[i];
    if (value === "--db" || value === "--out") {
      if (options[value] || !args[i + 1] || args[i + 1].startsWith("--"))
        throw new Error("参数缺少值或重复。");
      options[value] = args[++i];
    } else if (!value.startsWith("--") && !directory) directory = value;
    else throw new Error("无法识别的参数。");
  }
  if (command === "backup") {
    if (directory) throw new Error("请使用 --db 指定源文件。");
    const result = await createBackup(
      options["--db"] ??
        process.env.BETWEEN_ANSWERS_DB ??
        ".local/between-answers.sqlite",
      options["--out"],
    );
    console.log(
      `备份完成并通过校验：${result.directory}\n整机备份含双方私人数据与密码哈希，请勿上传公开仓库。`,
    );
  } else {
    if (
      !directory ||
      options["--db"] ||
      (command === "verify" && options["--out"])
    )
      throw new Error("请提供备份目录，或检查参数。");
    const verified = await verifyBackup(directory);
    if (command === "verify") {
      console.log("备份校验通过。");
      return;
    }
    console.log(
      "恢复只创建新副本。旧共享将关闭，旧会话与邀请码将失效；为备份中的各账号设置不同于旧密码的新密码。",
    );
    const passwords = {};
    for (const profile of verified.profiles) {
      const value = await hiddenPassword(
        `${profile.toUpperCase()} 的新密码（至少 12 字符，不回显）：`,
      );
      if ((await hiddenPassword("再次输入：")) !== value)
        throw new Error("两次密码不一致，未恢复。");
      passwords[profile] = value;
    }
    const result = await restoreBackup(directory, passwords, options["--out"]);
    console.log(
      `恢复副本已准备：${result.databasePath}\n现有数据库未替换。请按 docs/LOCAL_BACKUP.md 在单独的本地实例中检查副本。`,
    );
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "本地数据操作未完成。",
  );
  process.exitCode = 1;
});
