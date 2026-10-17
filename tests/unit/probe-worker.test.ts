import { describe, it, expect } from "vitest";
import worker from "../../worker/src/index";
import type { ProbeEnv } from "../../worker/src/index";
const env = {
  ALLOWED_ORIGINS: "https://linzeduan.github.io",
  PROBE_TOKEN_A: "a".repeat(40),
  PROBE_TOKEN_B: "b".repeat(40),
  DB: {
    batch() {
      throw new Error("Database must not be touched");
    },
  },
} as unknown as ProbeEnv;
describe("network probe boundary", () => {
  it("health never queries the database and is not cacheable", async () => {
    const response = await worker.fetch(
      new Request("https://example/health"),
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("rejects unauthorized requests before database access", async () => {
    for (const token of ["", "wrong-token".repeat(4)]) {
      const response = await worker.fetch(
        new Request("https://example/probe", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }),
        env,
      );
      expect(response.status).toBe(401);
    }
  });
  it("fails closed without valid and distinct server secrets", async () => {
    const response = await worker.fetch(
      new Request("https://example/probe", { method: "POST" }),
      { ...env, PROBE_TOKEN_A: undefined },
    );
    expect(response.status).toBe(503);
  });
  it("rejects hostile CORS origins and data bodies", async () => {
    const origin = await worker.fetch(
      new Request("https://example/probe", {
        method: "POST",
        headers: { Origin: "https://evil.example" },
      }),
      env,
    );
    expect(origin.status).toBe(403);
    expect(origin.headers.has("Access-Control-Allow-Origin")).toBe(false);
    const body = await worker.fetch(
      new Request("https://example/probe", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.PROBE_TOKEN_A}` },
        body: "private answer",
      }),
      env,
    );
    expect(body.status).toBe(400);
  });
});
