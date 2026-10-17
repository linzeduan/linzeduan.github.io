import { spawnSync } from "node:child_process";
const commands = [
  ["scripts/extract-questions.mjs", "--check"],
  ["node_modules/typescript/bin/tsc", "--noEmit"],
  ["node_modules/typescript/bin/tsc", "--noEmit", "-p", "worker/tsconfig.json"],
  ["node_modules/vitest/vitest.mjs", "run"],
  ["node_modules/vite/bin/vite.js", "build"],
];
for (const args of commands) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
