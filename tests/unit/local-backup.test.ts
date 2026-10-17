import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import {
  mkdtemp,
  readFile,
  writeFile,
  readdir,
  rm,
  stat,
} from "node:fs/promises";
import { resolve, join, sep } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Store } from "../../server/store";
import { hashPassword, tokenHash } from "../../server/password";
import { createLocalServer } from "../../server/http";
import {
  createBackup,
  restoreBackup,
  verifyBackup,
} from "../../server/local-backup";

const password = "Original-test-password-2026";
const newPasswords = {
  a: "New-test-password-A-2026",
  b: "New-test-password-B-2026",
};
let passwordHash: string;
beforeAll(async () => {
  passwordHash = await hashPassword(password);
});
const directories: string[] = [];
const stores: Store[] = [];
afterEach(async () => {
  stores.splice(0).forEach((s) => s.close());
  for (const directory of directories.splice(0)) {
    if (
      !resolve(directory).startsWith(
        resolve(tmpdir()) + sep + "between-answers-backup-test-",
      )
    )
      throw new Error("Unsafe temporary cleanup path");
    await rm(directory, { recursive: true, force: true });
  }
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "between-answers-backup-test-"));
  directories.push(root);
  const path = join(root, "source.sqlite");
  const store = new Store(path, () => new Date("2026-10-17T04:00:00Z"));
  stores.push(store);
  store.run("INSERT INTO metadata VALUES ('initialized','1')");
  for (const id of ["a", "b"])
    store.run(
      "INSERT INTO users VALUES (?,?,?,?)",
      id,
      id.toUpperCase(),
      passwordHash,
      store.stamp(),
    );
  store.db.exec("PRAGMA wal_autocheckpoint=0;");
  const spaceId = store.createSpace("a");
  const invite = store.invite("a");
  store.join("b", invite.code);
  const roundId = store.daily("a");
  for (const id of ["a", "b"] as const) {
    const entryId = randomUUID();
    store.save(id, {
      id: entryId,
      questionId: "q057",
      roundId,
      text: `${id} synthetic answer`,
      note: `${id} synthetic private note`,
      expectedRevision: 0,
    });
    store.submit(id, roundId, {
      entryId,
      expectedRevision: 1,
      operationId: randomUUID(),
    });
  }
  store.addComment("a", roundId, {
    text: "synthetic comment",
    operationId: randomUUID(),
  });
  store.run(
    "INSERT INTO sessions VALUES (?,?,?)",
    tokenHash("old-session"),
    "a",
    Date.now() + 86400000,
  );
  return { root, path, store, spaceId, roundId };
}

describe("consistent local backups and safe recovery", () => {
  it("excludes an unfinished transaction from a live WAL snapshot", async () => {
    const c = await fixture();
    c.store.db.exec("BEGIN IMMEDIATE");
    try {
      c.store.run(
        "UPDATE entries SET text='unfinished synthetic edit' WHERE owner='a'",
      );
      const snapshot = await createBackup(c.path, join(c.root, "backups"));
      const db = new DatabaseSync(snapshot.databasePath, { readOnly: true });
      try {
        expect(
          db.prepare("SELECT text FROM entries WHERE owner='a'").get()?.text,
        ).toBe("a synthetic answer");
      } finally {
        db.close();
      }
    } finally {
      c.store.db.exec("ROLLBACK");
    }
  });
  it("rejects broken foreign-key references even when the SQLite file is readable", async () => {
    const c = await fixture();
    c.store.db.exec("PRAGMA foreign_keys=OFF;");
    c.store.run(
      "INSERT INTO entry_revisions VALUES ('missing-entry',1,'synthetic','',?)",
      c.store.stamp(),
    );
    await expect(createBackup(c.path, join(c.root, "backups"))).rejects.toThrow(
      "完整性",
    );
    expect(await readdir(c.root)).not.toContain("backups");
  });
  it("captures committed WAL data while the live connection stays open, without overwriting backups", async () => {
    const c = await fixture();
    expect((await stat(c.path + "-wal")).size).toBeGreaterThan(0);
    const first = await createBackup(c.path, join(c.root, "backups"));
    expect(first.profiles).toEqual(["a", "b"]);
    const restoredRead = new DatabaseSync(first.databasePath, {
      readOnly: true,
    });
    try {
      expect(
        restoredRead
          .prepare("SELECT text,note FROM entries WHERE owner='b'")
          .get(),
      ).toMatchObject({
        text: "b synthetic answer",
        note: "b synthetic private note",
      });
      expect(
        restoredRead.prepare("PRAGMA journal_mode").get()?.journal_mode,
      ).toBe("delete");
    } finally {
      restoredRead.close();
    }
    expect(await readdir(first.directory)).toEqual(
      expect.arrayContaining(["data.sqlite", "manifest.json"]),
    );
    expect(
      (await readdir(first.directory)).filter((name) => name.endsWith("-wal")),
    ).toEqual([]);
    const second = await createBackup(c.path, join(c.root, "backups"));
    expect(second.directory).not.toBe(first.directory);
    expect((await verifyBackup(first.directory)).manifest.sha256).toBe(
      first.manifest.sha256,
    );
    const marker = await readFile(
      join(first.directory, "manifest.json"),
      "utf8",
    );
    for (const secret of [
      password,
      "synthetic answer",
      "synthetic private note",
      "password_hash",
      "old-session",
    ])
      expect(marker).not.toContain(secret);
    expect(c.store.unlocked("a", c.roundId)).toBe(true);
  });
  it("restores personal history to a new location, closes sharing and rejects old credentials through the API", async () => {
    const c = await fixture();
    const snapshot = await createBackup(c.path, join(c.root, "backups"));
    // Changes after the backup must not be undone in the active database.
    c.store.withdraw("b", c.roundId);
    const result = await restoreBackup(
      snapshot.directory,
      newPasswords,
      join(c.root, "restored"),
    );
    expect(await readdir(result.directory)).toEqual(["data.sqlite"]);
    const restored = new Store(result.databasePath);
    stores.push(restored);
    expect(result.databasePath).not.toBe(c.path);
    expect(
      c.store.one("SELECT withdrawn_at FROM submissions WHERE owner='b'")
        ?.withdrawn_at,
    ).not.toBeNull();
    expect(restored.one("SELECT count(*) AS n FROM sessions")?.n).toBe(0);
    expect(restored.one("SELECT count(*) AS n FROM invites")?.n).toBe(0);
    expect(restored.currentSpace("a")).toBeUndefined();
    expect(restored.export("a").entries[0]?.note).toBe(
      "a synthetic private note",
    );
    expect(restored.export("a").revisions).toHaveLength(1);
    expect(restored.export("a").comments).toHaveLength(1);
    const server = createLocalServer(restored);
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("No test API port");
    const base = `http://127.0.0.1:${address.port}/api`;
    try {
      expect(
        (
          await fetch(base + "/state", {
            headers: { Cookie: "between_answers_session=old-session" },
          })
        ).status,
      ).toBe(401);
      for (const id of ["a", "b"] as const) {
        const login = async (value: string) =>
          fetch(base + "/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ profile: id, password: value }),
          });
        expect((await login(password)).status).toBe(401);
        const response = await login(newPasswords[id]);
        expect(response.status).toBe(200);
        const cookie = response.headers.get("set-cookie")!.split(";")[0]!;
        const state = await (
          await fetch(base + "/state", { headers: { Cookie: cookie } })
        ).json();
        expect(state.entries[0].text).toBe(`${id} synthetic answer`);
        expect(JSON.stringify(state)).not.toContain(
          `${id === "a" ? "b" : "a"} synthetic private note`,
        );
        const other = id === "a" ? "b" : "a";
        expect(JSON.stringify(state)).not.toContain(
          `${other} synthetic answer`,
        );
        expect(
          (
            await fetch(
              base +
                `/rounds/${encodeURIComponent(c.roundId)}/answers/${other}`,
              { headers: { Cookie: cookie } },
            )
          ).status,
        ).toBe(403);
      }
    } finally {
      await new Promise<void>((done, reject) =>
        server.close((error) => (error ? reject(error) : done())),
      );
    }
    expect((await verifyBackup(snapshot.directory)).manifest.sha256).toBe(
      snapshot.manifest.sha256,
    );
  });
  it("rejects missing sources without creating a fake empty database", async () => {
    const root = await mkdtemp(join(tmpdir(), "between-answers-backup-test-"));
    directories.push(root);
    const source = join(root, "missing.sqlite");
    await expect(createBackup(source, join(root, "backups"))).rejects.toThrow();
    expect(await readdir(root)).toEqual([]);
  });
  it("rejects changed bytes and path-traversing manifests before preparing a recovery", async () => {
    const c = await fixture();
    const changed = await createBackup(c.path, join(c.root, "backups"));
    await writeFile(changed.databasePath, "damaged synthetic backup");
    await expect(verifyBackup(changed.directory)).rejects.toThrow("校验失败");
    await expect(
      restoreBackup(changed.directory, newPasswords, join(c.root, "restored")),
    ).rejects.toThrow();
    expect(await readdir(c.root)).not.toContain("restored");
    const traversing = await createBackup(c.path, join(c.root, "backups"));
    await writeFile(
      join(traversing.directory, "manifest.json"),
      JSON.stringify({
        ...traversing.manifest,
        databaseFile: "../source.sqlite",
      }),
    );
    await expect(verifyBackup(traversing.directory)).rejects.toThrow(
      "格式或版本",
    );
  });
  it("rejects unknown schemas and weak, missing or reused passwords without modifying the source", async () => {
    const c = await fixture();
    const snapshot = await createBackup(c.path, join(c.root, "backups"));
    for (const passwords of [
      { a: "short", b: newPasswords.b },
      { a: newPasswords.a },
      { a: password, b: newPasswords.b },
    ])
      await expect(
        restoreBackup(snapshot.directory, passwords, join(c.root, "restored")),
      ).rejects.toThrow();
    expect(await readdir(c.root)).not.toContain("restored");
    c.store.db.exec("PRAGMA user_version=2;");
    await expect(createBackup(c.path, join(c.root, "backups"))).rejects.toThrow(
      "版本",
    );
    c.store.db.exec(
      "PRAGMA user_version=1; CREATE TABLE unrelated (value TEXT);",
    );
    await expect(createBackup(c.path, join(c.root, "backups"))).rejects.toThrow(
      "结构",
    );
    expect((await verifyBackup(snapshot.directory)).manifest.sha256).toBe(
      snapshot.manifest.sha256,
    );
  });
  it("runs backup and verify from the CLI without exposing data and refuses unattended password input", async () => {
    const c = await fixture();
    const saved = spawnSync(
      process.execPath,
      [
        "scripts/local-data.mjs",
        "backup",
        "--db",
        c.path,
        "--out",
        join(c.root, "backups"),
      ],
      { encoding: "utf8" },
    );
    expect(saved.status, saved.stderr).toBe(0);
    const directory = join(
      c.root,
      "backups",
      (await readdir(join(c.root, "backups")))[0]!,
    );
    const checked = spawnSync(
      process.execPath,
      ["scripts/local-data.mjs", "verify", directory],
      { encoding: "utf8" },
    );
    expect(checked.status, checked.stderr).toBe(0);
    const noTerminal = spawnSync(
      process.execPath,
      [
        "scripts/local-data.mjs",
        "restore",
        directory,
        "--out",
        join(c.root, "restored"),
      ],
      { encoding: "utf8", input: JSON.stringify(newPasswords) },
    );
    expect(noTerminal.status).toBe(1);
    expect(noTerminal.stderr).toContain("交互终端");
    expect(await readdir(c.root)).not.toContain("restored");
    for (const secret of [
      password,
      newPasswords.a,
      newPasswords.b,
      "synthetic answer",
      "synthetic private note",
      "old-session",
    ])
      expect(
        saved.stdout +
          saved.stderr +
          checked.stdout +
          checked.stderr +
          noTerminal.stdout +
          noTerminal.stderr,
      ).not.toContain(secret);
  });
});
