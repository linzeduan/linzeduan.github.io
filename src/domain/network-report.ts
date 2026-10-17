import type { Profile } from "./types";
export type ProbePath = "/health" | "/probe" | "/probe/reject";
export type ProbeResult = {
  operation: string;
  path: ProbePath;
  ok: boolean;
  elapsedMs: number;
  status: number;
  error?: string;
  at: string;
};

export type NetworkRunContext = {
  serviceOrigin: string;
  tester: Profile;
  network: "Wi-Fi" | "移动网络";
  directConnection: boolean;
  browser: string;
  standalone: boolean;
};
export type NetworkResult = ProbeResult & { round: number };
export type NetworkAssessment = {
  outcome: "passed" | "failed" | "slow" | "not-direct" | "incomplete";
  completedRequests: number;
  passedRequests: number;
  coreLatencyP95Ms: number | null;
};
export type NetworkReport = {
  schemaVersion: 2;
  runId: string;
  context: NetworkRunContext;
  startedAt: string;
  endedAt: string;
  cancelled: boolean;
  assessment: NetworkAssessment;
  results: NetworkResult[];
};

// A single-device report is evidence for one test session, never a production approval.
export function assessNetworkRun(
  results: readonly NetworkResult[],
  cancelled: boolean,
  direct: boolean,
): NetworkAssessment {
  const completedRequests = results.filter(
    (r) => r.error !== "cancelled",
  ).length;
  const passedRequests = results.filter((r) => r.ok).length;
  const core = results
    .filter((r) => r.path !== "/probe/reject" && r.ok)
    .map((r) => r.elapsedMs)
    .toSorted((a, b) => a - b);
  const coreLatencyP95Ms = core.length
    ? core[Math.ceil(core.length * 0.95) - 1]!
    : null;
  // Verify coverage too: 30 duplicated responses must never be treated as ten rounds.
  const coverage = Array.from({ length: 10 }, (_, i) =>
    ["/health", "/probe", "/probe/reject"].every(
      (path) =>
        results.filter((r) => r.round === i + 1 && r.path === path).length ===
        1,
    ),
  ).every(Boolean);
  const outcome =
    cancelled || results.length !== 30 || !coverage
      ? "incomplete"
      : passedRequests !== 30
        ? "failed"
        : !direct
          ? "not-direct"
          : coreLatencyP95Ms !== null && coreLatencyP95Ms > 5000
            ? "slow"
            : "passed";
  return { outcome, completedRequests, passedRequests, coreLatencyP95Ms };
}

export const networkOutcomeLabels: Record<
  NetworkAssessment["outcome"],
  string
> = {
  passed: "本次直连检查通过",
  failed: "本次检查发现连接问题",
  slow: "请求成功，速度仍需复测",
  "not-direct": "请求成功，尚未确认直连",
  incomplete: "检查已中止，结果不完整",
};
