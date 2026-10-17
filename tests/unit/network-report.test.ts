import { afterEach, describe, expect, it, vi } from "vitest";
import { probeRequest } from "../../src/data/http/probe";
import { runNetworkProbe } from "../../src/data/http/run-probe";
import { assessNetworkRun } from "../../src/domain/network-report";
import type {
  NetworkResult,
  NetworkRunContext,
} from "../../src/domain/network-report";

const marker = "between-answers-network-probe";
const context: NetworkRunContext = {
  serviceOrigin: "https://example.workers.dev",
  tester: "a",
  network: "Wi-Fi",
  directConnection: true,
  browser: "Chrome",
  standalone: false,
};
function fullResults(): NetworkResult[] {
  return Array.from({ length: 10 }, (_, round) =>
    (["/health", "/probe", "/probe/reject"] as const).map((path) => ({
      operation: path,
      path,
      round: round + 1,
      ok: true,
      status: path === "/probe/reject" ? 401 : 200,
      elapsedMs: 200,
      at: "2026-10-17T04:00:00.000Z",
    })),
  ).flat();
}
function mockResponses(actor = "a") {
  return vi.fn(async (input: string | URL | Request) => {
    const path = new URL(input.toString()).pathname;
    return Response.json(
      path === "/health"
        ? { ok: true, service: marker }
        : path === "/probe"
          ? { ok: true, marker, actor }
          : { ok: false, code: "unauthorized" },
      { status: path === "/probe/reject" ? 401 : 200 },
    );
  });
}
function pendingFetch() {
  return vi.fn(
    (_input: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) reject(signal.reason);
        else
          signal?.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
      }),
  );
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("network report acceptance", () => {
  it("requires ten distinct rounds, expected denial checks and every operation to pass", () => {
    expect(assessNetworkRun(fullResults(), false, true).outcome).toBe("passed");
    const failed = fullResults();
    failed[2]!.ok = false;
    expect(assessNetworkRun(failed, false, true).outcome).toBe("failed");
    expect(
      assessNetworkRun(fullResults().slice(0, 29), false, true).outcome,
    ).toBe("incomplete");
    expect(
      assessNetworkRun(
        Array.from({ length: 30 }, () => fullResults()[0]!),
        false,
        true,
      ).outcome,
    ).toBe("incomplete");
    expect(assessNetworkRun(fullResults(), true, true).outcome).toBe(
      "incomplete",
    );
  });
  it("does not accept slow or unconfirmed direct connections", () => {
    const slow = fullResults().map((r) => ({
      ...r,
      elapsedMs: r.path === "/probe/reject" ? 50 : 6000,
    }));
    expect(assessNetworkRun(slow, false, true)).toMatchObject({
      outcome: "slow",
      coreLatencyP95Ms: 6000,
    });
    expect(assessNetworkRun(fullResults(), false, false).outcome).toBe(
      "not-direct",
    );
  });
});

describe("probe requests", () => {
  it("verifies service identity, marker and selected tester, not just HTTP status", async () => {
    vi.stubGlobal("fetch", mockResponses("b"));
    expect(await probeRequest(context.serviceOrigin, "/health")).toMatchObject({
      ok: true,
    });
    expect(
      await probeRequest(context.serviceOrigin, "/probe", "secret", {
        expectedActor: "a",
      }),
    ).toMatchObject({ ok: false, error: "unexpected_actor" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ok: true })),
    );
    expect(await probeRequest(context.serviceOrigin, "/health")).toMatchObject({
      ok: false,
      error: "unexpected_response",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ok: false }, { status: 401 })),
    );
    expect(
      await probeRequest(context.serviceOrigin, "/probe/reject"),
    ).toMatchObject({ ok: false });
  });
  it("handles malformed responses without exporting arbitrary server text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>gateway</html>", { status: 502 })),
    );
    expect(await probeRequest(context.serviceOrigin, "/health")).toMatchObject({
      ok: false,
      status: 502,
      error: "invalid_response",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ ok: false, code: "reflected-private-secret" }),
      ),
    );
    const result = await probeRequest(context.serviceOrigin, "/probe");
    expect(result.error).toBe("unexpected_response");
    expect(JSON.stringify(result)).not.toContain("reflected-private-secret");
  });
  it("cancels an active request and does not start a request with an aborted signal", async () => {
    const fetch = pendingFetch();
    vi.stubGlobal("fetch", fetch);
    const controller = new AbortController();
    const pending = probeRequest(context.serviceOrigin, "/health", undefined, {
      signal: controller.signal,
    });
    controller.abort();
    expect(await pending).toMatchObject({
      ok: false,
      status: 0,
      error: "cancelled",
    });
    await probeRequest(context.serviceOrigin, "/health", undefined, {
      signal: controller.signal,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("terminates a hung request after ten seconds and clears its timer", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", pendingFetch());
    const pending = probeRequest(context.serviceOrigin, "/health");
    await vi.advanceTimersByTimeAsync(10000);
    expect(await pending).toMatchObject({ ok: false, error: "timeout" });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("network run lifecycle", () => {
  it("fixes context at the start and exports no secret even if inputs change", async () => {
    const fetch = mockResponses();
    vi.stubGlobal("fetch", fetch);
    const config = { ...context, token: "private-network-probe-token" };
    const progress: NetworkResult[] = [];
    const report = await runNetworkProbe(
      config,
      new AbortController().signal,
      (result) => {
        progress.push(result);
        config.network = "移动网络";
        config.tester = "b";
      },
    );
    expect(progress).toHaveLength(30);
    expect(fetch).toHaveBeenCalledTimes(30);
    expect(report.context).toMatchObject({ network: "Wi-Fi", tester: "a" });
    expect(report.assessment.outcome).toBe("passed");
    expect(JSON.stringify(report)).not.toContain(config.token);
    expect(JSON.stringify(report)).not.toContain("Authorization");
  });
  it("stops the whole run immediately on cancellation", async () => {
    const fetch = pendingFetch();
    vi.stubGlobal("fetch", fetch);
    const controller = new AbortController();
    const pending = runNetworkProbe(
      { ...context, token: "private-token" },
      controller.signal,
      () => {},
    );
    controller.abort();
    const report = await pending;
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(report.cancelled).toBe(true);
    expect(report.assessment.outcome).toBe("incomplete");
    expect(report.results[0]!.error).toBe("cancelled");
  });
  it("marks an already cancelled run incomplete without network requests", async () => {
    const fetch = mockResponses();
    vi.stubGlobal("fetch", fetch);
    const controller = new AbortController();
    controller.abort();
    const report = await runNetworkProbe(
      { ...context, token: "private-token" },
      controller.signal,
      () => {},
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(report.assessment.outcome).toBe("incomplete");
  });
});
