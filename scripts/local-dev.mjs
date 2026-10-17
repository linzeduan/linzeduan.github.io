import { spawn } from "node:child_process";
if (Number(process.versions.node.split(".")[0]) < 24) {
  console.error("Local mode requires Node.js 24 or newer.");
  process.exit(1);
}
const children = [];
function start(args, env = {}) {
  const child = spawn(process.execPath, args, {
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  children.push(child);
  child.on("error", () => shutdown(1));
  child.on("exit", (code) => {
    if (!closing) shutdown(code ?? 1);
  });
  return child;
}
let closing = false;
function shutdown(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
process.on("SIGINT", () => shutdown());
process.on("SIGTERM", () => shutdown());
start(["server/main.ts"]);
start(
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    "5173",
    "--strictPort",
  ],
  { VITE_APP_MODE: "local" },
);
