import type { Profile } from "../../domain/types";
import type { ProbePath, ProbeResult } from "../../domain/network-report";
export type { ProbePath, ProbeResult } from "../../domain/network-report";
const serverErrors = new Set([
  "unauthorized",
  "probe_not_configured",
  "origin_not_allowed",
  "database_unavailable",
  "verification_failed",
  "not_found",
  "body_not_allowed",
]);
export function validateApiUrl(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    )
  )
    throw new Error("服务地址必须使用 HTTPS。");
  if (url.username || url.password || url.search || url.hash)
    throw new Error("地址不能包含账号、密码、查询参数或片段。");
  if (url.pathname !== "/" && url.pathname !== "")
    throw new Error("请输入服务根地址，不要附带路径。");
  return url.origin;
}
export async function probeRequest(
  base: string,
  path: ProbePath,
  token?: string,
  options: { signal?: AbortSignal; expectedActor?: Profile } = {},
): Promise<ProbeResult> {
  const start = performance.now();
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (options.signal?.aborted) cancel();
  else options.signal?.addEventListener("abort", cancel, { once: true });
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 10000);
  const operation =
    path === "/health"
      ? "连通性"
      : path === "/probe"
        ? "授权数据库读写"
        : "无效凭证拒绝";
  const result = (
    ok: boolean,
    status: number,
    error?: string,
  ): ProbeResult => ({
    operation,
    path,
    ok,
    status,
    elapsedMs: Math.round(performance.now() - start),
    at: new Date().toISOString(),
    ...(error ? { error } : {}),
  });
  try {
    if (controller.signal.aborted) return result(false, 0, "cancelled");
    const response = await fetch(`${validateApiUrl(base)}${path}`, {
      method: path === "/health" ? "GET" : "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      if (controller.signal.aborted) throw error;
      return result(false, response.status, "invalid_response");
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      return result(false, response.status, "invalid_response");
    const data = body as Record<string, unknown>;
    const rejected = path === "/probe/reject";
    const ok = rejected
      ? response.status === 401 &&
        data.ok === false &&
        data.code === "unauthorized"
      : response.ok &&
        data.ok === true &&
        (path === "/health"
          ? data.service === "between-answers-network-probe"
          : data.marker === "between-answers-network-probe");
    if (!ok)
      return result(
        false,
        response.status,
        typeof data.code === "string" && serverErrors.has(data.code)
          ? data.code
          : "unexpected_response",
      );
    if (
      path === "/probe" &&
      options.expectedActor &&
      data.actor !== options.expectedActor
    )
      return result(false, response.status, "unexpected_actor");
    return result(true, response.status);
  } catch {
    return result(
      false,
      0,
      options.signal?.aborted
        ? "cancelled"
        : timedOut
          ? "timeout"
          : "network_error",
    );
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", cancel);
  }
}
