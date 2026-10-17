import type { D1Database } from "@cloudflare/workers-types";
export interface ProbeEnv {
  DB: D1Database;
  ALLOWED_ORIGINS: string;
  PROBE_TOKEN_A?: string;
  PROBE_TOKEN_B?: string;
}
async function sameSecret(actual: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(actual)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const left = new Uint8Array(a),
    right = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i]! ^ right[i]!;
  return difference === 0;
}
export default {
  async fetch(request: Request, env: ProbeEnv): Promise<Response> {
    const origin = request.headers.get("Origin");
    const allowed = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim());
    const headers = new Headers({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      Vary: "Origin",
    });
    if (origin && allowed.includes(origin))
      headers.set("Access-Control-Allow-Origin", origin);
    const json = (body: unknown, status = 200) =>
      Response.json(body, { status, headers });
    if (origin && !allowed.includes(origin))
      return json({ ok: false, code: "origin_not_allowed" }, 403);
    if (request.method === "OPTIONS") {
      headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      headers.set("Access-Control-Allow-Headers", "Authorization");
      headers.set("Access-Control-Max-Age", "600");
      return new Response(null, { status: 204, headers });
    }
    const path = new URL(request.url).pathname;
    if (path === "/health" && request.method === "GET")
      return json({
        ok: true,
        service: "between-answers-network-probe",
        serverTime: new Date().toISOString(),
      });
    if (
      (path !== "/probe" && path !== "/probe/reject") ||
      request.method !== "POST"
    )
      return json({ ok: false, code: "not_found" }, 404);
    const token =
      request.headers
        .get("Authorization")
        ?.match(/^Bearer (\S{32,256})$/)?.[1] ?? "";
    if (
      !env.PROBE_TOKEN_A ||
      !env.PROBE_TOKEN_B ||
      env.PROBE_TOKEN_A.length < 32 ||
      env.PROBE_TOKEN_B.length < 32 ||
      env.PROBE_TOKEN_A === env.PROBE_TOKEN_B
    )
      return json({ ok: false, code: "probe_not_configured" }, 503);
    const [isA, isB] = await Promise.all([
      sameSecret(token, env.PROBE_TOKEN_A),
      sameSecret(token, env.PROBE_TOKEN_B),
    ]);
    if (!token || (!isA && !isB))
      return json({ ok: false, code: "unauthorized" }, 401);
    if (path !== "/probe") return json({ ok: false, code: "not_found" }, 404);
    const actor = isA ? "a" : "b";
    const marker = "between-answers-network-probe";
    // Reject bodies: only a fixed synthetic value can ever reach this database.
    if (request.body) {
      const reader = request.body.getReader();
      const first = await reader.read();
      await reader.cancel();
      if (first.value?.byteLength)
        return json({ ok: false, code: "body_not_allowed" }, 400);
    }
    try {
      const results = await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO network_probe (actor,marker,checked_at,checks) VALUES (?,?,?,1) ON CONFLICT(actor) DO UPDATE SET checked_at=excluded.checked_at,checks=checks+1",
        ).bind(actor, marker, new Date().toISOString()),
        env.DB.prepare("SELECT marker FROM network_probe WHERE actor=?").bind(
          actor,
        ),
      ]);
      const stored = results[1]?.results[0] as { marker?: string } | undefined;
      if (stored?.marker !== marker)
        return json({ ok: false, code: "verification_failed" }, 503);
      return json({ ok: true, marker, actor });
    } catch {
      return json({ ok: false, code: "database_unavailable" }, 503);
    }
  },
};
