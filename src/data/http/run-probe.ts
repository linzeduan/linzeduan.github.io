import { probeRequest, validateApiUrl } from "./probe";
import type { ProbePath } from "./probe";
import { assessNetworkRun } from "../../domain/network-report";
import type {
  NetworkResult,
  NetworkReport,
  NetworkRunContext,
} from "../../domain/network-report";

export async function runNetworkProbe(
  config: NetworkRunContext & { token: string },
  signal: AbortSignal,
  onResult: (result: NetworkResult) => void,
): Promise<NetworkReport> {
  // Copy only the declared public metadata; never retain a token in an exportable object.
  const context: NetworkRunContext = {
    serviceOrigin: validateApiUrl(config.serviceOrigin),
    tester: config.tester,
    network: config.network,
    directConnection: config.directConnection,
    browser: config.browser,
    standalone: config.standalone,
  };
  const startedAt = new Date().toISOString();
  const token = config.token;
  const results: NetworkResult[] = [];
  const paths: ProbePath[] = ["/health", "/probe", "/probe/reject"];
  for (let round = 1; round <= 10 && !signal.aborted; round++) {
    for (const path of paths) {
      if (signal.aborted) break;
      const key =
        path === "/probe"
          ? token
          : path === "/probe/reject"
            ? "invalid-probe-token"
            : undefined;
      const result = {
        ...(await probeRequest(context.serviceOrigin, path, key, {
          signal,
          expectedActor: context.tester,
        })),
        round,
      };
      results.push(result);
      onResult(result);
    }
  }
  const cancelled = signal.aborted;
  return {
    schemaVersion: 2,
    runId: crypto.randomUUID(),
    context,
    startedAt,
    endedAt: new Date().toISOString(),
    cancelled,
    assessment: assessNetworkRun(results, cancelled, context.directConnection),
    results,
  };
}
