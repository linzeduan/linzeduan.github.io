// Test-only clock injection; production keeps its real service clock.
import { readFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { Store } from "../../server/store.ts";
import { createLocalServer } from "../../server/http.ts";

const source = process.env.BETWEEN_ANSWERS_DB;
const clock = process.env.BETWEEN_ANSWERS_TEST_CLOCK;
if (
  !source ||
  !clock ||
  !resolve(source).startsWith(resolve(".local") + sep + "local-e2e-") ||
  dirname(resolve(source)) !== dirname(resolve(clock))
)
  throw new Error("A private synthetic test directory is required");
const store = new Store(
  source,
  () => new Date(readFileSync(clock, "utf8").trim()),
);
const server = createLocalServer(store);
const port = Number(process.env.BETWEEN_ANSWERS_PORT);
server.listen(port, "127.0.0.1", () =>
  console.log(
    `Local API ready at http://127.0.0.1:${port} (synthetic clock fixture)`,
  ),
);
server.on("error", () => {
  store.close();
  process.exitCode = 1;
});
process.on("SIGTERM", () =>
  server.close(() => {
    store.close();
    process.exit(0);
  }),
);
