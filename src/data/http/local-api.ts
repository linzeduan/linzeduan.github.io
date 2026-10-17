export class LocalApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export async function localRequest<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new LocalApiError(
      0,
      "network_error",
      "未连接到本地服务，请确认服务已启动。",
    );
  }
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new LocalApiError(
      response.status,
      "invalid_response",
      "本地服务响应异常，请确认服务已启动。",
    );
  }
  if (!response.ok) {
    const error = value as { code?: string; message?: string };
    throw new LocalApiError(
      response.status,
      error.code ?? "request_failed",
      error.message ?? "操作未完成。",
    );
  }
  return value as T;
}
