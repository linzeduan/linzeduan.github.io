import { spawn } from "node:child_process";
const wrangler = "node_modules/wrangler/bin/wrangler.js";
const common = [
  "--config",
  "worker/wrangler.jsonc",
  "--persist-to",
  ".local/e2e-d1",
];
const migrate = spawn(
  process.execPath,
  [
    wrangler,
    "d1",
    "migrations",
    "apply",
    "between-answers-probe",
    "--local",
    ...common,
  ],
  {
    stdio: "inherit",
    env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false" },
  },
);
migrate.on("exit", (code) => {
  if (code !== 0) {
    process.exit(code ?? 1);
    return;
  }
  const dev = spawn(
    process.execPath,
    [
      wrangler,
      "dev",
      "--ip",
      "127.0.0.1",
      "--port",
      "8787",
      ...common,
      "--var",
      "PROBE_TOKEN_A:local-demo-only-token-a-minimum-32-characters",
      "--var",
      "PROBE_TOKEN_B:local-demo-only-token-b-minimum-32-characters",
    ],
    {
      stdio: "inherit",
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    },
  );
  process.on("SIGTERM", () => dev.kill());
  process.on("SIGINT", () => dev.kill());
  dev.on("exit", (status) => process.exit(status ?? 0));
});
