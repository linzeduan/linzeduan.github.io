export type ProbeResult = {
  operation: string;
  ok: boolean;
  elapsedMs: number;
  status: number;
  error?: string;
  at: string;
};
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
  path: string,
  token?: string,
): Promise<ProbeResult> {
  const start = performance.now();
  const operation =
    path === "/health"
      ? "连通性"
      : path === "/probe"
        ? "授权数据库读写"
        : "无效凭证拒绝";
  try {
    const response = await fetch(`${validateApiUrl(base)}${path}`, {
      method: path === "/health" ? "GET" : "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const body = (await response.json()) as {
      ok?: boolean;
      code?: string;
      marker?: string;
    };
    const rejected = path === "/probe/reject";
    const ok = rejected
      ? response.status === 401
      : response.ok &&
        body.ok === true &&
        (path === "/health" || body.marker === "between-answers-network-probe");
    return {
      operation,
      ok,
      elapsedMs: Math.round(performance.now() - start),
      status: response.status,
      at: new Date().toISOString(),
      ...(!ok ? { error: body.code ?? "unexpected_response" } : {}),
    };
  } catch (error) {
    return {
      operation,
      ok: false,
      elapsedMs: Math.round(performance.now() - start),
      status: 0,
      error: error instanceof Error ? error.name : "network_error",
      at: new Date().toISOString(),
    };
  }
}
