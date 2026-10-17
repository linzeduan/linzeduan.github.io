import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Store } from "../../server/store";
import { createLocalServer } from "../../server/http";
import { hashPassword } from "../../server/password";

const password = "Local-testing-password-2026";
let passwordHash: string;
beforeAll(async () => {
  passwordHash = await hashPassword(password);
});
const contexts: {
  store: Store;
  server: ReturnType<typeof createLocalServer>;
}[] = [];
async function fixture(initialize = true) {
  let now = new Date("2026-10-17T04:00:00Z");
  const store = new Store(":memory:", () => now);
  if (initialize) {
    store.run("INSERT INTO metadata VALUES ('initialized','1')");
    for (const user of ["a", "b"])
      store.run(
        "INSERT INTO users VALUES (?,?,?,?)",
        user,
        user.toUpperCase(),
        passwordHash,
        store.stamp(),
      );
  }
  const server = createLocalServer(store);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No local test port");
  const base = `http://127.0.0.1:${address.port}`;
  async function request(
    path: string,
    method = "GET",
    data?: unknown,
    cookie?: string,
    extra: Record<string, string> = {},
  ) {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(data === undefined ? {} : { "Content-Type": "application/json" }),
        ...extra,
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    return {
      status: response.status,
      body: await response.json(),
      headers: response.headers,
    };
  }
  async function login(profile: "a" | "b") {
    const r = await request("/api/login", "POST", { profile, password });
    expect(r.status).toBe(200);
    return r.headers.get("set-cookie")!.split(";")[0]!;
  }
  const context = {
    store,
    server,
    request,
    login,
    time: (value: string) => {
      now = new Date(value);
    },
  };
  contexts.push(context);
  return context;
}
afterEach(async () => {
  for (const c of contexts.splice(0)) {
    await new Promise<void>((resolve, reject) =>
      c.server.close((error) => (error ? reject(error) : resolve())),
    );
    c.store.close();
  }
});
async function paired() {
  const c = await fixture();
  const a = await c.login("a"),
    b = await c.login("b");
  const created = await c.request("/api/spaces", "POST", {}, a);
  const invite = await c.request("/api/spaces/invite", "POST", {}, a);
  expect(
    (await c.request("/api/spaces/join", "POST", { code: invite.body.code }, b))
      .status,
  ).toBe(200);
  const state = await c.request("/api/state", "GET", undefined, a);
  return {
    ...c,
    a,
    b,
    spaceId: created.body.id as string,
    roundId: state.body.todayRoundId as string,
  };
}
async function save(
  c: Awaited<ReturnType<typeof paired>>,
  cookie: string,
  content: string,
  note = "private-note",
) {
  const id = randomUUID();
  const r = await c.request(
    "/api/entries",
    "POST",
    {
      id,
      questionId: "q057",
      roundId: c.roundId,
      text: content,
      note,
      expectedRevision: 0,
    },
    cookie,
  );
  expect(r.status).toBe(200);
  return r.body;
}

describe("local authenticated API", () => {
  it("initializes exactly two accounts, uses private cookies and invalidates logout", async () => {
    const c = await fixture(false);
    expect((await c.request("/api/state")).status).toBe(401);
    const setup = { a: { name: "A", password }, b: { name: "B", password } };
    expect((await c.request("/api/setup", "POST", setup)).status).toBe(201);
    expect((await c.request("/api/setup", "POST", setup)).status).toBe(409);
    const login = await c.request("/api/login", "POST", {
      profile: "a",
      password,
    });
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie")!;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(JSON.stringify(login.body)).not.toContain("token");
    expect(
      c.store.one("SELECT password_hash FROM users WHERE id='a'")!
        .password_hash,
    ).not.toContain(password);
    const session = cookie.split(";")[0]!;
    expect(
      (await c.request("/api/state", "GET", undefined, session)).status,
    ).toBe(200);
    expect(
      (await c.request("/api/logout", "POST", undefined, session)).status,
    ).toBe(200);
    expect(
      (await c.request("/api/state", "GET", undefined, session)).status,
    ).toBe(401);
  });
  it("denies reads before both submit, omits private notes and freezes the shared version", async () => {
    const c = await paired();
    const a = await save(c, c.a, "A independent answer", "A secret note"),
      b = await save(c, c.b, "B independent answer", "B secret note");
    const path = `/api/rounds/${encodeURIComponent(c.roundId)}`;
    expect(
      (await c.request(path + "/answers/b", "GET", undefined, c.a)).status,
    ).toBe(403);
    const operationId = randomUUID();
    const command = { entryId: a.id, expectedRevision: 1, operationId };
    expect(
      (await c.request(path + "/submit", "POST", command, c.a)).status,
    ).toBe(200);
    expect(
      (await c.request(path + "/submit", "POST", command, c.a)).status,
    ).toBe(200);
    const waiting = await c.request("/api/state", "GET", undefined, c.a);
    expect(JSON.stringify(waiting.body)).not.toContain("B independent answer");
    expect(JSON.stringify(waiting.body)).not.toContain("B secret note");
    expect(
      (
        await c.request(
          path + "/submit",
          "POST",
          { entryId: b.id, expectedRevision: 1, operationId: randomUUID() },
          c.b,
        )
      ).status,
    ).toBe(200);
    expect(
      (await c.request(path + "/answers/b", "GET", undefined, c.a)).body.text,
    ).toBe("B independent answer");
    expect(
      (
        await c.request(
          "/api/entries",
          "POST",
          {
            id: b.id,
            questionId: "q057",
            roundId: c.roundId,
            text: "B edited later",
            note: "still private",
            expectedRevision: 1,
          },
          c.b,
        )
      ).status,
    ).toBe(200);
    expect(
      (await c.request(path + "/answers/b", "GET", undefined, c.a)).body.text,
    ).toBe("B independent answer");
    expect(
      (
        await c.request(
          path + "/submit",
          "POST",
          { entryId: b.id, expectedRevision: 2, operationId: randomUUID() },
          c.b,
        )
      ).status,
    ).toBe(409);
    expect(
      JSON.stringify(
        (await c.request("/api/state", "GET", undefined, c.a)).body,
      ),
    ).not.toContain("still private");
    expect((await c.request(path + "/withdraw", "POST", {}, c.b)).status).toBe(
      200,
    );
    expect(
      (await c.request(path + "/answers/b", "GET", undefined, c.a)).status,
    ).toBe(403);
    expect(
      (
        await c.request(
          path + "/comments",
          "POST",
          { text: "blocked", operationId: randomUUID() },
          c.a,
        )
      ).status,
    ).toBe(403);
  });
  it("rejects forged ownership, cross-space operations and modifying another person’s data", async () => {
    const c = await paired();
    const b = await save(c, c.b, "B original");
    expect(
      (await c.request(`/api/entries/${b.id}`, "GET", undefined, c.a)).status,
    ).toBe(404);
    expect(
      (await c.request(`/api/entries/${b.id}`, "DELETE", undefined, c.a))
        .status,
    ).toBe(404);
    expect(
      (
        await c.request(
          "/api/entries",
          "POST",
          {
            id: b.id,
            questionId: "q057",
            roundId: c.roundId,
            text: "forged",
            note: "",
            expectedRevision: 1,
          },
          c.a,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await c.request(
          "/api/entries",
          "POST",
          {
            id: randomUUID(),
            owner: "b",
            questionId: "q057",
            text: "forged",
            note: "",
            expectedRevision: 0,
          },
          c.a,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await c.request(
          `/api/spaces/${randomUUID()}/dissolve`,
          "POST",
          { confirmation: "DISSOLVE_SPACE" },
          c.a,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await c.request(
          "/api/state",
          "GET",
          undefined,
          "between_answers_session=forged",
        )
      ).status,
    ).toBe(401);
    expect(() =>
      c.store.run("INSERT INTO members VALUES (?,?,1)", c.spaceId, "c"),
    ).toThrow("space_full");
  });
  it("handles concurrent saves with a version conflict and preserves historical values", async () => {
    const c = await paired();
    const a = await save(c, c.a, "first");
    const data = {
      id: a.id,
      questionId: "q057",
      roundId: c.roundId,
      note: "",
      expectedRevision: 1,
    };
    const results = await Promise.all(
      ["second", "third"].map((text) =>
        c.request("/api/entries", "POST", { ...data, text }, c.a),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const history = await c.request(
      `/api/entries/${a.id}/revisions`,
      "GET",
      undefined,
      c.a,
    );
    expect(history.body).toHaveLength(2);
    expect(history.body[1].text).toBe("first");
    expect(
      (await c.request(`/api/entries/${a.id}/revisions`, "GET", undefined, c.b))
        .status,
    ).toBe(404);
  });
  it("isolates real spaces and round IDs that belong only to the other account", async () => {
    const c = await fixture();
    const a = await c.login("a"),
      b = await c.login("b");
    const own = await c.request("/api/spaces", "POST", {}, a);
    const foreign = await c.request("/api/spaces", "POST", {}, b);
    expect(own.body.id).not.toBe(foreign.body.id);
    c.store.run(
      "INSERT INTO rounds VALUES (?,?,?,'2026-10-17','free','b',NULL,0,?)",
      "foreign-round",
      foreign.body.id,
      "q057",
      c.store.stamp(),
    );
    expect(
      (
        await c.request(
          `/api/spaces/${foreign.body.id}/dissolve`,
          "POST",
          { confirmation: "DISSOLVE_SPACE" },
          a,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await c.request(
          "/api/rounds/foreign-round/answers/b",
          "GET",
          undefined,
          a,
        )
      ).status,
    ).toBe(404);
    expect(
      (await c.request("/api/rounds/foreign-round/accept", "POST", {}, a))
        .status,
    ).toBe(404);
    expect(
      (
        await c.request(
          "/api/entries",
          "POST",
          {
            id: randomUUID(),
            questionId: "q057",
            roundId: "foreign-round",
            text: "forbidden",
            note: "",
            expectedRevision: 0,
          },
          a,
        )
      ).status,
    ).toBe(404);
    const state = await c.request("/api/state", "GET", undefined, a);
    expect(JSON.stringify(state.body)).not.toContain("foreign-round");
    expect(
      c.store.one("SELECT status FROM spaces WHERE id=?", foreign.body.id)
        ?.status,
    ).toBe("waiting");
  });
  it("allows only the author to remove a comment and revokes all sessions after a password change", async () => {
    const c = await paired();
    const anotherA = await c.login("a");
    const a = await save(c, c.a, "A"),
      b = await save(c, c.b, "B");
    const path = `/api/rounds/${encodeURIComponent(c.roundId)}`;
    for (const [cookie, entry] of [
      [c.a, a],
      [c.b, b],
    ] as const) {
      expect(
        (
          await c.request(
            path + "/submit",
            "POST",
            {
              entryId: entry.id,
              expectedRevision: 1,
              operationId: randomUUID(),
            },
            cookie,
          )
        ).status,
      ).toBe(200);
    }
    const comment = { text: "A own comment", operationId: randomUUID() };
    await c.request(path + "/comments", "POST", comment, c.a);
    await c.request(path + "/comments", "POST", comment, c.a);
    const id = c.store.one("SELECT id FROM comments WHERE owner='a'")!.id;
    expect(c.store.one("SELECT count(*) AS n FROM comments")?.n).toBe(1);
    expect(
      (await c.request(`/api/comments/${id}`, "DELETE", undefined, c.b)).status,
    ).toBe(404);
    expect(
      (await c.request(`/api/comments/${id}`, "DELETE", undefined, c.a)).status,
    ).toBe(200);
    expect(
      (
        await c.request(
          "/api/password",
          "POST",
          { currentPassword: password, newPassword: password + "-new" },
          c.a,
        )
      ).status,
    ).toBe(200);
    for (const cookie of [c.a, anotherA])
      expect(
        (await c.request("/api/state", "GET", undefined, cookie)).status,
      ).toBe(401);
    expect(
      (await c.request("/api/login", "POST", { profile: "a", password }))
        .status,
    ).toBe(401);
    expect(
      (
        await c.request("/api/login", "POST", {
          profile: "a",
          password: password + "-new",
        })
      ).status,
    ).toBe(200);
    expect((await c.request("/api/state", "GET", undefined, c.b)).status).toBe(
      200,
    );
    expect(
      (await c.request("/api/skips", "POST", { questionId: "q999" }, c.b))
        .status,
    ).toBe(400);
  });
  it("checks invite expiry and Shanghai dates using the service clock", async () => {
    const c = await fixture();
    const a = await c.login("a"),
      b = await c.login("b");
    await c.request("/api/spaces", "POST", {}, a);
    const expired = await c.request("/api/spaces/invite", "POST", {}, a);
    c.time("2026-10-18T04:00:01Z");
    expect(
      (
        await c.request(
          "/api/spaces/join",
          "POST",
          { code: expired.body.code },
          b,
        )
      ).status,
    ).toBe(400);
    const invite = await c.request("/api/spaces/invite", "POST", {}, a);
    expect(
      (
        await c.request(
          "/api/spaces/join",
          "POST",
          { code: invite.body.code },
          b,
        )
      ).status,
    ).toBe(200);
    const day1 = (await c.request("/api/state", "GET", undefined, a)).body;
    c.time("2026-10-18T16:00:00Z");
    const day2 = (await c.request("/api/state", "GET", undefined, a)).body;
    expect(day2.serverDay).toBe("2026-10-19");
    expect(day2.todayQuestionId).not.toBe(day1.todayQuestionId);
    const back = await c.request(
      "/api/rounds/daily",
      "POST",
      { date: "2026-10-18" },
      a,
    );
    expect(back.body.id).toBe(day1.todayRoundId);
    expect(
      (await c.request("/api/rounds/daily", "POST", { date: "2026-10-20" }, a))
        .status,
    ).toBe(400);
    expect(
      (await c.request("/api/rounds/daily", "POST", { date: "2026-02-31" }, a))
        .status,
    ).toBe(400);
  });
  it("requires mutual acceptance for free questions, including explicit sensitive consent", async () => {
    const c = await paired();
    expect(
      (await c.request("/api/rounds/free", "POST", { questionId: "q133" }, c.a))
        .status,
    ).toBe(400);
    const free = await c.request(
      "/api/rounds/free",
      "POST",
      { questionId: "q133", sensitiveConsent: true },
      c.a,
    );
    expect(free.status).toBe(201);
    const id = encodeURIComponent(free.body.id);
    expect(
      (await c.request(`/api/rounds/${id}/accept`, "POST", {}, c.b)).status,
    ).toBe(400);
    expect(
      (
        await c.request(
          `/api/rounds/${id}/accept`,
          "POST",
          { consent: true },
          c.b,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await c.request("/api/state", "GET", undefined, c.b)
      ).body.roundViews.find(
        (r: { roundId: string }) => r.roundId === free.body.id,
      ).needsAcceptance,
    ).toBe(false);
  });
  it("exports only owned records by default and deletes own snapshots, notes and versions", async () => {
    const c = await paired();
    const a = await save(c, c.a, "A answer", "A private"),
      b = await save(c, c.b, "B answer", "B private");
    const path = `/api/rounds/${encodeURIComponent(c.roundId)}`;
    for (const [cookie, entry] of [
      [c.a, a],
      [c.b, b],
    ] as const)
      await c.request(
        path + "/submit",
        "POST",
        { entryId: entry.id, expectedRevision: 1, operationId: randomUUID() },
        cookie,
      );
    await c.request(
      path + "/comments",
      "POST",
      { text: "B private-owned comment", operationId: randomUUID() },
      c.b,
    );
    const own = await c.request("/api/export", "GET", undefined, c.a);
    expect(JSON.stringify(own.body)).not.toContain("B answer");
    expect(JSON.stringify(own.body)).not.toContain("B private");
    expect(own.body.revisions[0].note).toBe("A private");
    const shared = await c.request(
      "/api/export?includePartner=true",
      "GET",
      undefined,
      c.a,
    );
    expect(JSON.stringify(shared.body)).toContain("B answer");
    expect(JSON.stringify(shared.body)).not.toContain('B private"');
    expect(
      (await c.request(`/api/entries/${a.id}`, "DELETE", undefined, c.a))
        .status,
    ).toBe(200);
    expect(
      JSON.stringify(
        (await c.request("/api/export", "GET", undefined, c.a)).body,
      ),
    ).not.toContain("A answer");
    expect(
      c.store.one(
        "SELECT count(*) AS n FROM entry_revisions WHERE entry_id=?",
        a.id,
      )!.n,
    ).toBe(0);
    expect(
      (await c.request(path + "/answers/a", "GET", undefined, c.b)).status,
    ).toBe(403);
    expect(
      (await c.request(`/api/entries/${b.id}`, "GET", undefined, c.b)).body
        .text,
    ).toBe("B answer");
  });
  it("retains personal data after dissolution and deletes only the authenticated account", async () => {
    const c = await paired();
    const a = await save(c, c.a, "A retained"),
      b = await save(c, c.b, "B retained");
    expect(
      (await c.request(`/api/spaces/${c.spaceId}/dissolve`, "POST", {}, c.a))
        .status,
    ).toBe(400);
    expect(
      (
        await c.request(
          `/api/spaces/${c.spaceId}/dissolve`,
          "POST",
          { confirmation: "DISSOLVE_SPACE" },
          c.a,
        )
      ).status,
    ).toBe(200);
    expect(
      (await c.request(`/api/entries/${a.id}`, "GET", undefined, c.a)).body
        .text,
    ).toBe("A retained");
    expect(
      (
        await c.request(
          "/api/account",
          "DELETE",
          { password, confirmation: "DELETE_MY_ACCOUNT" },
          c.a,
        )
      ).status,
    ).toBe(200);
    expect((await c.request("/api/state", "GET", undefined, c.a)).status).toBe(
      401,
    );
    expect(
      (await c.request(`/api/entries/${b.id}`, "GET", undefined, c.b)).body
        .text,
    ).toBe("B retained");
    expect(
      (
        await c.request("/api/setup", "POST", {
          a: { name: "new", password },
          b: { name: "new", password },
        })
      ).status,
    ).toBe(409);
  });
  it("rejects cross-origin JSON operations and limits failed login attempts", async () => {
    const c = await fixture();
    expect(
      (
        await c.request(
          "/api/login",
          "POST",
          { profile: "a", password },
          undefined,
          { Origin: "https://evil.example" },
        )
      ).status,
    ).toBe(403);
    for (let i = 0; i < 5; i++)
      expect(
        (
          await c.request("/api/login", "POST", {
            profile: "a",
            password: "wrong-password",
          })
        ).status,
      ).toBe(401);
    expect(
      (await c.request("/api/login", "POST", { profile: "a", password }))
        .status,
    ).toBe(429);
  });
});
