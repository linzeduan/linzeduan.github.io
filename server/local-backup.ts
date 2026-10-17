import { DatabaseSync, backup } from "node:sqlite";
import { createReadStream, readFileSync } from "node:fs";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  rename,
  rm,
  rmdir,
} from "node:fs/promises";
import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import type { Profile } from "../src/domain/types.ts";
import { hashPassword, validPassword, verifyPassword } from "./password.ts";

const appVersion = (
  JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version: string }
).version;
const fileName = "data.sqlite";
export type BackupManifest = {
  format: "between-answers-sqlite-backup";
  version: 1;
  appVersion: string;
  createdAt: string;
  schemaVersion: 1;
  databaseFile: "data.sqlite";
  byteLength: number;
  sha256: string;
};
export type VerifiedBackup = {
  directory: string;
  databasePath: string;
  manifest: BackupManifest;
  profiles: Profile[];
};
function schema(db: DatabaseSync) {
  return JSON.stringify(
    db
      .prepare(
        "SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*' ORDER BY type,name",
      )
      .all()
      .map((row) => ({
        ...row,
        sql: String(row.sql).replace(/\s+/g, " ").trim(),
      })),
  );
}
let expectedSchema: string | undefined;
function validate(db: DatabaseSync): Profile[] {
  db.exec("PRAGMA trusted_schema=OFF; PRAGMA busy_timeout=5000;");
  if (db.prepare("PRAGMA user_version").get()?.user_version !== 1)
    throw new Error("数据库版本不受当前备份工具支持。");
  if (!expectedSchema) {
    const expected = new DatabaseSync(":memory:");
    try {
      expected.exec(
        readFileSync(new URL("./schema.sql", import.meta.url), "utf8"),
      );
      expectedSchema = schema(expected);
    } finally {
      expected.close();
    }
  }
  if (schema(db) !== expectedSchema)
    throw new Error("数据库结构不匹配，未进行恢复。");
  const integrity = db.prepare("PRAGMA integrity_check").all();
  if (
    integrity.length !== 1 ||
    integrity[0]?.integrity_check !== "ok" ||
    db.prepare("PRAGMA foreign_key_check").all().length
  )
    throw new Error("数据库完整性检查未通过。");
  const users = db
    .prepare("SELECT id,password_hash FROM users ORDER BY id")
    .all();
  if (
    users.some(
      (u) =>
        !["a", "b"].includes(String(u.id)) ||
        !/^scrypt\$32768\$[\da-f]{32}\$[\da-f]{128}$/.test(
          String(u.password_hash),
        ),
    )
  )
    throw new Error("账号数据格式不匹配。");
  return users.map((u) => u.id as Profile);
}
async function regularFile(path: string) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink())
    throw new Error("请提供普通文件，不支持符号链接。");
  return info;
}
async function digest(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
async function workingDirectory(root: string, prefix: string) {
  const parent = resolve(root);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  return mkdtemp(
    join(
      parent,
      `${prefix}-${new Date().toISOString().replace(/[:.]/g, "-")}-`,
    ),
  );
}
// Only files created in our newly allocated, private directory are removed.
async function discard(directory: string) {
  for (const name of [
    "pending.sqlite",
    "pending.sqlite-wal",
    "pending.sqlite-shm",
    "pending.sqlite-journal",
    fileName,
    `${fileName}-wal`,
    `${fileName}-shm`,
    `${fileName}-journal`,
    "manifest.json",
  ])
    await rm(join(directory, name), { force: true }).catch(() => {});
  await rmdir(directory).catch(() => {});
}
function standalone(path: string) {
  const db = new DatabaseSync(path);
  try {
    db.exec("PRAGMA trusted_schema=OFF;");
    if (
      db.prepare("PRAGMA journal_mode=DELETE").get()?.journal_mode !== "delete"
    )
      throw new Error("无法生成独立数据库文件。");
    validate(db);
  } finally {
    db.close();
  }
}
export async function createBackup(
  sourcePath: string,
  outputRoot = ".local/backups",
): Promise<VerifiedBackup> {
  const source = resolve(sourcePath);
  await regularFile(source);
  const db = new DatabaseSync(source, { readOnly: true });
  let directory: string | undefined;
  try {
    validate(db);
    directory = await workingDirectory(outputRoot, "backup");
    const path = join(directory, fileName);
    await backup(db, path);
    standalone(path);
    await chmod(path, 0o600);
    const manifest: BackupManifest = {
      format: "between-answers-sqlite-backup",
      version: 1,
      appVersion,
      createdAt: new Date().toISOString(),
      schemaVersion: 1,
      databaseFile: fileName,
      byteLength: (await regularFile(path)).size,
      sha256: await digest(path),
    };
    const marker = await open(join(directory, "manifest.json"), "wx", 0o600);
    try {
      await marker.writeFile(JSON.stringify(manifest, null, 2) + "\n", "utf8");
      await marker.sync();
    } finally {
      await marker.close();
    }
    return await verifyBackup(directory);
  } catch (error) {
    if (directory) await discard(directory);
    throw error;
  } finally {
    db.close();
  }
}
export async function verifyBackup(
  backupDirectory: string,
): Promise<VerifiedBackup> {
  const directory = resolve(backupDirectory);
  const markerPath = join(directory, "manifest.json");
  const info = await regularFile(markerPath);
  if (info.size > 16384) throw new Error("备份清单无效。");
  let manifest: BackupManifest;
  try {
    manifest = JSON.parse(await readFile(markerPath, "utf8")) as BackupManifest;
  } catch {
    throw new Error("备份清单无效或不完整。");
  }
  if (
    !manifest ||
    manifest.format !== "between-answers-sqlite-backup" ||
    manifest.version !== 1 ||
    manifest.schemaVersion !== 1 ||
    manifest.databaseFile !== fileName ||
    typeof manifest.appVersion !== "string" ||
    typeof manifest.createdAt !== "string" ||
    !Number.isFinite(Date.parse(manifest.createdAt)) ||
    !Number.isSafeInteger(manifest.byteLength) ||
    manifest.byteLength <= 0 ||
    typeof manifest.sha256 !== "string" ||
    !/^[\da-f]{64}$/.test(manifest.sha256)
  )
    throw new Error("备份清单格式或版本不受支持。");
  const databasePath = join(directory, fileName);
  if (
    (await regularFile(databasePath)).size !== manifest.byteLength ||
    (await digest(databasePath)) !== manifest.sha256
  )
    throw new Error("备份文件校验失败，内容可能损坏或不完整。");
  // A published backup must be a self-contained file, not a moving WAL database.
  for (const suffix of ["-wal", "-journal"])
    try {
      if ((await lstat(databasePath + suffix)).size)
        throw new Error("备份含未合并的日志，不能使用。");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return { directory, databasePath, manifest, profiles: validate(db) };
  } finally {
    db.close();
  }
}
export async function restoreBackup(
  backupDirectory: string,
  passwords: Partial<Record<Profile, string>>,
  outputRoot = ".local/restored",
) {
  const verified = await verifyBackup(backupDirectory);
  if (
    Object.keys(passwords).some(
      (id) => !verified.profiles.includes(id as Profile),
    )
  )
    throw new Error("只能为备份中现有的账号设置密码。");
  const source = new DatabaseSync(verified.databasePath, { readOnly: true });
  const hashes = new Map<Profile, string>();
  try {
    for (const profile of verified.profiles) {
      const password = validPassword(passwords[profile]);
      const old = String(
        source
          .prepare("SELECT password_hash FROM users WHERE id=?")
          .get(profile)!.password_hash,
      );
      if (await verifyPassword(password, old))
        throw new Error("恢复时请设置与备份中不同的新密码。");
      hashes.set(profile, await hashPassword(password));
    }
  } finally {
    source.close();
  }
  const directory = await workingDirectory(outputRoot, "recovery");
  const databasePath = join(directory, fileName);
  const pendingPath = join(directory, "pending.sqlite");
  try {
    await copyFile(verified.databasePath, pendingPath, constants.COPYFILE_EXCL);
    if ((await digest(pendingPath)) !== verified.manifest.sha256)
      throw new Error("复制期间备份发生变化，未进行恢复。");
    const db = new DatabaseSync(pendingPath);
    try {
      validate(db);
      db.exec("BEGIN IMMEDIATE");
      try {
        db.exec(
          "DELETE FROM sessions; DELETE FROM invites; DELETE FROM login_attempts; UPDATE spaces SET status='dissolved'; UPDATE members SET active=0; UPDATE rounds SET closed=1;",
        );
        db.prepare(
          "UPDATE submissions SET withdrawn_at=COALESCE(withdrawn_at,?)",
        ).run(new Date().toISOString());
        for (const [profile, hash] of hashes)
          db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(
            hash,
            profile,
          );
        db.prepare(
          "INSERT INTO metadata(key,value) VALUES ('recovered_at',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        ).run(new Date().toISOString());
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      validate(db);
    } finally {
      db.close();
    }
    standalone(pendingPath);
    await chmod(pendingPath, 0o600);
    if (
      dirname(resolve(pendingPath)) !== directory ||
      dirname(resolve(databasePath)) !== directory
    )
      throw new Error("恢复文件路径不在本次创建的目录中。");
    await rename(pendingPath, databasePath);
    return { directory, databasePath };
  } catch (error) {
    await discard(directory);
    throw error;
  }
}
