import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { Store } from "./store.ts";
import { createLocalServer } from "./http.ts";
const dbPath = resolve(
  process.env.BETWEEN_ANSWERS_DB ?? ".local/between-answers.sqlite",
);
mkdirSync(dirname(dbPath), { recursive: true });
const store = new Store(dbPath);
const port = Number(process.env.BETWEEN_ANSWERS_PORT ?? 8788);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid local port.");
const server = createLocalServer(store);
server.listen(port, "127.0.0.1", () =>
  console.log(
    `Local API ready at http://127.0.0.1:${port} (SQLite stays on this computer)`,
  ),
);
server.on("error", () => {
  console.error(
    "Local API could not start. Check whether the port is already in use.",
  );
  process.exitCode = 1;
  store.close();
});
let closing = false;
const close = () => {
  if (closing) return;
  closing = true;
  server.close(() => {
    store.close();
    process.exit(0);
  });
};
process.on("SIGINT", close);
process.on("SIGTERM", close);
