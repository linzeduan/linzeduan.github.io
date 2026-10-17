import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { Store, question } from "./store.ts";
import { ApiError, fail, fields, text } from "./errors.ts";
import {
  hashPassword,
  tokenHash,
  validPassword,
  verifyPassword,
} from "./password.ts";

const cookieName = "between_answers_session";
const cookie = (value: string, age = 86400 * 7) =>
  `${cookieName}=${value}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${age}`;
async function body(request: IncomingMessage): Promise<unknown> {
  if (!request.headers["content-type"]?.startsWith("application/json"))
    fail(415, "invalid_content_type", "请使用 JSON 请求。");
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    size += data.length;
    if (size > 256 * 1024) fail(413, "payload_too_large", "内容过长。");
    chunks.push(data);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    fail(400, "invalid_json", "请求内容不是有效 JSON。");
  }
}
export function createLocalServer(
  store: Store,
  options: { origins?: string[] } = {},
) {
  const origins = new Set(
    options.origins ?? [
      "http://127.0.0.1:5173",
      "http://localhost:5173",
      "http://127.0.0.1:4173",
      "http://127.0.0.1:4175",
    ],
  );
  let authWork = 0;
  const work = async <T>(action: () => Promise<T>) => {
    if (authWork >= 2) fail(429, "busy", "登录操作较多，请稍后重试。");
    authWork++;
    try {
      return await action();
    } finally {
      authWork--;
    }
  };
  const server = createServer((request, response) => {
    void handle(request, response);
  });
  async function handle(request: IncomingMessage, response: ServerResponse) {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    const send = (value: unknown, status = 200) => {
      response.statusCode = status;
      response.end(JSON.stringify(value));
    };
    try {
      const host = request.headers.host ?? "";
      if (
        !/^127\.0\.0\.1(?::\d+)?$/.test(host) &&
        !/^localhost(?::\d+)?$/.test(host)
      )
        fail(403, "invalid_host", "仅支持本机访问。");
      const origin = request.headers.origin;
      if (origin && !origins.has(origin))
        fail(403, "invalid_origin", "请求来源不可用。");
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const path = url.pathname;
      const method = request.method;
      const rawToken =
        request.headers.cookie
          ?.split(";")
          .map((s) => s.trim())
          .find((s) => s.startsWith(cookieName + "="))
          ?.slice(cookieName.length + 1) ?? "";
      const session = rawToken
        ? store.one(
            "SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>?",
            tokenHash(rawToken),
            store.now().getTime(),
          )
        : undefined;
      const uid = session ? String(session.user_id) : undefined;
      if (path === "/api/session" && method === "GET") {
        send({
          initialized: store.initialized(),
          ...(uid ? { user: store.user(uid) } : {}),
        });
        return;
      }
      if (path === "/api/health" && method === "GET") {
        send({ ok: true, mode: "local" });
        return;
      }
      if (path === "/api/setup" && method === "POST") {
        if (store.initialized())
          fail(409, "already_initialized", "本地账号已经创建，不能重新注册。");
        const data = fields(await body(request), ["a", "b"]);
        const a = fields(data.a, ["name", "password"]),
          b = fields(data.b, ["name", "password"]);
        const users = [
          ["a", text(a.name, "称呼", 40, false), validPassword(a.password)],
          ["b", text(b.name, "称呼", 40, false), validPassword(b.password)],
        ] as const;
        const hashes = await work(async () => [
          await hashPassword(users[0][2]),
          await hashPassword(users[1][2]),
        ]);
        store.tx(() => {
          if (store.initialized())
            fail(409, "already_initialized", "本地账号已经创建。");
          for (let i = 0; i < users.length; i++)
            store.run(
              "INSERT INTO users VALUES (?,?,?,?)",
              users[i]![0],
              users[i]![1],
              hashes[i]!,
              store.stamp(),
            );
          store.run("INSERT INTO metadata VALUES ('initialized','1')");
        });
        send({ ok: true }, 201);
        return;
      }
      if (path === "/api/login" && method === "POST") {
        const data = fields(await body(request), ["profile", "password"]);
        const profile = text(data.profile, "账号", 1, false);
        if (!["a", "b"].includes(profile))
          fail(401, "invalid_login", "账号或密码不正确。");
        const password = text(data.password, "密码", 128, false);
        const now = store.now().getTime();
        const attempt = store.one(
          "SELECT * FROM login_attempts WHERE user_id=?",
          profile,
        );
        if (
          attempt &&
          Number(attempt.reset_at) > now &&
          Number(attempt.attempts) >= 5
        )
          fail(429, "login_limited", "尝试次数较多，请 15 分钟后再试。");
        store.run(
          "INSERT INTO login_attempts VALUES (?,1,?) ON CONFLICT(user_id) DO UPDATE SET attempts=CASE WHEN reset_at<=? THEN 1 ELSE attempts+1 END,reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END",
          profile,
          now + 900000,
          now,
          now,
        );
        const user = store.one("SELECT * FROM users WHERE id=?", profile);
        const valid = user
          ? await work(() =>
              verifyPassword(password, String(user.password_hash)),
            )
          : false;
        if (
          !valid ||
          store.one("SELECT password_hash FROM users WHERE id=?", profile)
            ?.password_hash !== user?.password_hash
        )
          fail(401, "invalid_login", "账号或密码不正确。");
        const token = randomBytes(32).toString("base64url");
        store.run("DELETE FROM login_attempts WHERE user_id=?", profile);
        store.run("DELETE FROM sessions WHERE expires_at<=?", now);
        store.run(
          "INSERT INTO sessions VALUES (?,?,?)",
          tokenHash(token),
          profile,
          now + 7 * 86400000,
        );
        response.setHeader("Set-Cookie", cookie(token));
        send({ user: store.user(profile) });
        return;
      }
      if (!uid) fail(401, "unauthorized", "请先登录。");
      if (path === "/api/logout" && method === "POST") {
        store.run(
          "DELETE FROM sessions WHERE token_hash=?",
          tokenHash(rawToken),
        );
        response.setHeader("Set-Cookie", cookie("", 0));
        send({ ok: true });
        return;
      }
      if (path === "/api/state" && method === "GET") {
        send(store.state(uid));
        return;
      }
      if (path === "/api/spaces" && method === "POST") {
        fields(await body(request), []);
        send({ id: store.createSpace(uid) }, 201);
        return;
      }
      if (path === "/api/spaces/invite" && method === "POST") {
        fields(await body(request), []);
        send(store.invite(uid), 201);
        return;
      }
      if (path === "/api/spaces/join" && method === "POST") {
        const data = fields(await body(request), ["code"]);
        store.join(uid, text(data.code, "邀请码", 100, false));
        send({ ok: true });
        return;
      }
      const spaceMatch = path.match(/^\/api\/spaces\/([^/]+)\/dissolve$/);
      if (spaceMatch && method === "POST") {
        const data = fields(await body(request), ["confirmation"]);
        if (data.confirmation !== "DISSOLVE_SPACE")
          fail(400, "confirmation_required", "请确认解散空间。");
        store.dissolve(uid, decodeURIComponent(spaceMatch[1]!));
        send({ ok: true });
        return;
      }
      if (path === "/api/rounds/daily" && method === "POST") {
        const data = fields(await body(request), ["date"]);
        send({
          id: store.daily(
            uid,
            data.date === undefined
              ? undefined
              : text(data.date, "日期", 10, false),
          ),
        });
        return;
      }
      if (path === "/api/rounds/free" && method === "POST") {
        const data = fields(await body(request), [
          "questionId",
          "sensitiveConsent",
        ]);
        send(
          { id: store.free(uid, data.questionId, data.sensitiveConsent) },
          201,
        );
        return;
      }
      if (path === "/api/entries" && method === "POST") {
        const data = fields(await body(request), [
          "id",
          "questionId",
          "text",
          "note",
          "expectedRevision",
          "roundId",
        ]);
        send(store.save(uid, data));
        return;
      }
      const entryMatch = path.match(
        /^\/api\/entries\/([^/]+)(?:\/(revisions|reanswer))?$/,
      );
      if (entryMatch) {
        const id = decodeURIComponent(entryMatch[1]!);
        const action = entryMatch[2];
        if (!action && method === "GET") {
          send(store.entryDto(store.entry(uid, id)));
          return;
        }
        if (!action && method === "DELETE") {
          store.deleteEntry(uid, id);
          send({ ok: true });
          return;
        }
        if (action === "revisions" && method === "GET") {
          send(store.revisions(uid, id));
          return;
        }
        if (action === "reanswer" && method === "POST") {
          fields(await body(request), []);
          const old = store.entry(uid, id);
          send(
            store.save(uid, {
              id: crypto.randomUUID(),
              questionId: old.question_id,
              text: "",
              note: "",
              expectedRevision: 0,
            }),
            201,
          );
          return;
        }
      }
      const roundMatch = path.match(
        /^\/api\/rounds\/([^/]+)\/(submit|withdraw|accept|decline|comments|answers)(?:\/([^/]+))?$/,
      );
      if (roundMatch) {
        const id = decodeURIComponent(roundMatch[1]!),
          action = roundMatch[2],
          target = roundMatch[3]
            ? decodeURIComponent(roundMatch[3])
            : undefined;
        if (action === "answers" && target && method === "GET") {
          send(store.readAnswer(uid, id, target));
          return;
        }
        if (method === "POST") {
          if (action === "submit") {
            const data = fields(await body(request), [
              "entryId",
              "expectedRevision",
              "operationId",
            ]);
            store.submit(uid, id, data);
            send({ ok: true });
            return;
          }
          if (action === "withdraw") {
            fields(await body(request), []);
            store.withdraw(uid, id);
            send({ ok: true });
            return;
          }
          if (action === "accept") {
            const data = fields(await body(request), ["consent"]);
            store.accept(uid, id, data.consent);
            send({ ok: true });
            return;
          }
          if (action === "decline") {
            fields(await body(request), []);
            store.decline(uid, id);
            send({ ok: true });
            return;
          }
          if (action === "comments") {
            const data = fields(await body(request), [
              "text",
              "replyTo",
              "operationId",
            ]);
            store.addComment(uid, id, data);
            send({ ok: true }, 201);
            return;
          }
        }
      }
      const commentMatch = path.match(/^\/api\/comments\/([^/]+)$/);
      if (commentMatch && method === "DELETE") {
        store.removeComment(uid, decodeURIComponent(commentMatch[1]!));
        send({ ok: true });
        return;
      }
      if (path === "/api/skips" && method === "POST") {
        const data = fields(await body(request), ["questionId"]);
        const q = question(data.questionId).questionId;
        store.run("INSERT OR IGNORE INTO skips VALUES (?,?)", uid, q);
        send({ ok: true });
        return;
      }
      if (path === "/api/export" && method === "GET") {
        send(
          store.export(uid, url.searchParams.get("includePartner") === "true"),
        );
        return;
      }
      if (path === "/api/password" && method === "POST") {
        const data = fields(await body(request), [
          "currentPassword",
          "newPassword",
        ]);
        const old = store.one(
          "SELECT password_hash FROM users WHERE id=?",
          uid,
        )!.password_hash;
        if (
          !(await work(() =>
            verifyPassword(
              text(data.currentPassword, "当前密码", 128, false),
              String(old),
            ),
          ))
        )
          fail(401, "invalid_password", "当前密码不正确。");
        const next = await work(() =>
          hashPassword(validPassword(data.newPassword)),
        );
        store.tx(() => {
          if (
            store.one("SELECT password_hash FROM users WHERE id=?", uid)
              ?.password_hash !== old
          )
            fail(409, "password_changed", "密码已在另一处修改，请重新登录。");
          store.run("UPDATE users SET password_hash=? WHERE id=?", next, uid);
          store.run("DELETE FROM sessions WHERE user_id=?", uid);
        });
        response.setHeader("Set-Cookie", cookie("", 0));
        send({ ok: true });
        return;
      }
      if (path === "/api/account" && method === "DELETE") {
        const data = fields(await body(request), ["password", "confirmation"]);
        if (data.confirmation !== "DELETE_MY_ACCOUNT")
          fail(400, "confirmation_required", "请确认删除本人账号。");
        const stored = store.one(
          "SELECT password_hash FROM users WHERE id=?",
          uid,
        )!.password_hash;
        if (
          !(await work(() =>
            verifyPassword(
              text(data.password, "密码", 128, false),
              String(stored),
            ),
          ))
        )
          fail(401, "invalid_password", "密码不正确。");
        if (
          store.one("SELECT password_hash FROM users WHERE id=?", uid)
            ?.password_hash !== stored
        )
          fail(409, "password_changed", "请重新登录后操作。");
        store.deleteUser(uid);
        response.setHeader("Set-Cookie", cookie("", 0));
        send({ ok: true });
        return;
      }
      fail(404, "not_found", "接口不存在。");
    } catch (error) {
      if (error instanceof ApiError)
        send({ code: error.code, message: error.message }, error.status);
      else
        send({ code: "internal_error", message: "操作未完成，请重试。" }, 500);
    }
  }
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return server;
}
