import { DatabaseSync } from "node:sqlite";
import type { SQLInputValue } from "node:sqlite";
import { readFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { dayKey, dayOffset } from "../src/domain/date.ts";
import type {
  Entry,
  Profile,
  Question,
  SharedView,
} from "../src/domain/types.ts";
import type {
  LocalSpace,
  LocalState,
  LocalUser,
  EntryRevision,
  LocalExport,
  ExportRound,
} from "../src/domain/local.ts";
import { ApiError, fail, text, number } from "./errors.ts";
import { tokenHash } from "./password.ts";

type Row = Record<string, string | number | null>;
const bindings = (values: (SQLInputValue | undefined)[]) =>
  values.map((value) => {
    if (value === undefined) throw new Error("Missing SQL binding");
    return value;
  });
const questions = JSON.parse(
  readFileSync(
    new URL("../src/content/questions.json", import.meta.url),
    "utf8",
  ),
) as Question[];
const questionMap = new Map(questions.map((q) => [q.questionId, q]));
const plan = JSON.parse(
  readFileSync(new URL("../src/content/plan.json", import.meta.url), "utf8"),
) as { version: string; automaticQuestionIds: string[] };
export const question = (id: unknown) => {
  const q = typeof id === "string" ? questionMap.get(id) : undefined;
  if (!q) fail(400, "invalid_question", "题目不存在。");
  return q;
};
export class Store {
  db: DatabaseSync;
  now: () => Date;
  constructor(path: string, now = () => new Date()) {
    this.now = now;
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
    this.db.exec(
      readFileSync(new URL("./schema.sql", import.meta.url), "utf8"),
    );
    this.run(
      "INSERT OR IGNORE INTO plans VALUES (?,?)",
      plan.version,
      JSON.stringify(plan.automaticQuestionIds),
    );
  }
  close() {
    this.db.close();
  }
  stamp() {
    return this.now().toISOString();
  }
  one(sql: string, ...values: (SQLInputValue | undefined)[]): Row | undefined {
    return this.db.prepare(sql).get(...bindings(values)) as Row | undefined;
  }
  all(sql: string, ...values: (SQLInputValue | undefined)[]): Row[] {
    return this.db.prepare(sql).all(...bindings(values)) as Row[];
  }
  run(sql: string, ...values: (SQLInputValue | undefined)[]) {
    return this.db.prepare(sql).run(...bindings(values));
  }
  tx<T>(action: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = action();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  initialized() {
    return Boolean(this.one("SELECT 1 FROM metadata WHERE key='initialized'"));
  }
  user(id: string): LocalUser {
    const user = this.one("SELECT id,name FROM users WHERE id=?", id);
    if (!user) fail(401, "unauthorized", "请重新登录。");
    return { id: user.id as Profile, name: String(user.name) };
  }
  currentSpace(uid: string): Row | undefined {
    return this.one(
      "SELECT s.* FROM spaces s JOIN members m ON m.space_id=s.id WHERE m.user_id=? AND m.active=1",
      uid,
    );
  }
  space(uid: string, id: string): Row {
    const s = this.one(
      "SELECT s.* FROM spaces s JOIN members m ON m.space_id=s.id WHERE s.id=? AND m.user_id=?",
      id,
      uid,
    );
    if (!s) fail(404, "not_found", "空间不存在。");
    return s;
  }
  active(uid: string): Row {
    const s = this.currentSpace(uid);
    if (!s || s.status !== "active")
      fail(409, "space_inactive", "请先完成双人绑定。");
    return s;
  }
  createSpace(uid: string) {
    return this.tx(() => {
      if (this.currentSpace(uid))
        fail(409, "already_bound", "你已经有一个活动空间。");
      const id = randomUUID();
      this.run(
        "INSERT INTO spaces VALUES (?,'waiting',NULL,?,?)",
        id,
        plan.version,
        this.stamp(),
      );
      this.run("INSERT INTO members VALUES (?,?,1)", id, uid);
      return id;
    });
  }
  invite(uid: string) {
    return this.tx(() => {
      const s = this.currentSpace(uid);
      if (!s || s.status !== "waiting")
        fail(409, "space_full", "当前空间不能再邀请成员。");
      this.run(
        "DELETE FROM invites WHERE space_id=? AND used_by IS NULL",
        s.id,
      );
      const code = randomBytes(32).toString("base64url");
      const expiresAt = this.now().getTime() + 86400000;
      this.run(
        "INSERT INTO invites VALUES (?,?,?,NULL)",
        tokenHash(code),
        s.id,
        expiresAt,
      );
      return { code, expiresAt };
    });
  }
  join(uid: string, code: string) {
    return this.tx(() => {
      const invite = this.one(
        "SELECT * FROM invites WHERE token_hash=?",
        tokenHash(code),
      );
      if (!invite) fail(400, "invalid_invite", "邀请码不可用或已过期。");
      const s = this.one("SELECT * FROM spaces WHERE id=?", invite.space_id);
      const current = this.currentSpace(uid);
      if (
        current?.id === s?.id &&
        invite.used_by === uid &&
        s?.status === "active"
      )
        return;
      if (current) fail(409, "already_bound", "你已经有一个活动空间。");
      if (
        !s ||
        s.status !== "waiting" ||
        invite.used_by ||
        Number(invite.expires_at) <= this.now().getTime()
      )
        fail(400, "invalid_invite", "邀请码不可用或已过期。");
      this.run("INSERT INTO members VALUES (?,?,1)", s.id, uid);
      this.run(
        "UPDATE spaces SET status='active',start_day=? WHERE id=?",
        dayKey(this.now()),
        s.id,
      );
      this.run(
        "UPDATE invites SET used_by=? WHERE token_hash=?",
        uid,
        tokenHash(code),
      );
    });
  }
  dissolve(uid: string, id: string) {
    return this.tx(() => {
      this.space(uid, id);
      this.run("UPDATE spaces SET status='dissolved' WHERE id=?", id);
      this.run("UPDATE members SET active=0 WHERE space_id=?", id);
      this.run("DELETE FROM invites WHERE space_id=?", id);
    });
  }
  daily(uid: string, date = dayKey(this.now())): string {
    const s = this.active(uid);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !s.start_day ||
      date < String(s.start_day) ||
      date > dayKey(this.now()) ||
      dayKey(new Date(`${date}T00:00:00+08:00`)) !== date
    )
      fail(400, "invalid_date", "只能补答空间开始后、今天及以前的问题。");
    const ids = JSON.parse(
      String(
        this.one(
          "SELECT question_ids FROM plans WHERE version=?",
          s.plan_version,
        )!.question_ids,
      ),
    ) as string[];
    const id = ids[dayOffset(String(s.start_day), date)];
    if (!id) fail(409, "plan_finished", "推荐题目已经用完，可以自由选题。");
    const roundId = `${s.id}:${date}`;
    this.run(
      "INSERT OR IGNORE INTO rounds VALUES (?,?,?,?,'daily',?,NULL,0,?)",
      roundId,
      s.id,
      id,
      date,
      uid,
      this.stamp(),
    );
    return roundId;
  }
  round(uid: string, id: string): Row {
    const round = this.one(
      "SELECT r.* FROM rounds r JOIN members m ON r.space_id=m.space_id WHERE r.id=? AND m.user_id=?",
      id,
      uid,
    );
    if (!round) fail(404, "not_found", "问答不存在。");
    return round;
  }
  openRound(uid: string, id: string): Row {
    const r = this.round(uid, id);
    const s = this.space(uid, String(r.space_id));
    if (s.status !== "active" || r.closed)
      fail(409, "round_closed", "这轮共享已关闭。");
    return r;
  }
  free(uid: string, qid: unknown, consent: unknown) {
    const q = question(qid);
    if (q.sensitivity === "high" && consent !== true)
      fail(400, "consent_required", "这道题需要明确同意后再邀请。");
    const s = this.active(uid);
    const id = randomUUID();
    this.run(
      "INSERT INTO rounds VALUES (?,?,?,?,'free',?,NULL,0,?)",
      id,
      s.id,
      q.questionId,
      dayKey(this.now()),
      uid,
      this.stamp(),
    );
    return id;
  }
  accept(uid: string, id: string, consent: unknown) {
    const r = this.openRound(uid, id);
    if (r.kind !== "free" || r.creator === uid)
      fail(409, "invalid_state", "当前无需接受邀请。");
    if (question(r.question_id).sensitivity === "high" && consent !== true)
      fail(400, "consent_required", "请先确认愿意回答这道题。");
    this.run("UPDATE rounds SET accepted_by=? WHERE id=?", uid, id);
  }
  decline(uid: string, id: string) {
    const r = this.openRound(uid, id);
    if (r.kind !== "free" || r.creator === uid || r.accepted_by)
      fail(409, "invalid_state", "这轮邀请无法拒绝。");
    this.run("UPDATE rounds SET closed=1 WHERE id=?", id);
  }
  entry(uid: string, id: string): Row {
    const e = this.one("SELECT * FROM entries WHERE id=? AND owner=?", id, uid);
    if (!e) fail(404, "not_found", "记录不存在。");
    return e;
  }
  entryDto(e: Row): Entry {
    return {
      id: String(e.id),
      owner: e.owner as Profile,
      questionId: String(e.question_id),
      text: String(e.text),
      note: String(e.note),
      revision: Number(e.revision),
      status: e.status as Entry["status"],
      createdAt: String(e.created_at),
      updatedAt: String(e.updated_at),
      ...(e.round_id ? { roundId: String(e.round_id) } : {}),
    };
  }
  save(uid: string, data: Record<string, unknown>) {
    const id = text(data.id, "记录编号", 160, false);
    const q = question(data.questionId);
    const body = text(data.text, "回答");
    const note = text(data.note, "笔记");
    const expected = number(data.expectedRevision);
    const roundId =
      data.roundId === undefined
        ? null
        : text(data.roundId, "问答编号", 160, false);
    return this.tx(() => {
      const existing = this.one("SELECT * FROM entries WHERE id=?", id);
      if (existing && existing.owner !== uid)
        fail(404, "not_found", "记录不存在。");
      if (
        existing &&
        (existing.question_id !== q.questionId || existing.round_id !== roundId)
      )
        fail(400, "immutable_reference", "记录所属题目不能修改。");
      if (Number(existing?.revision ?? 0) !== expected)
        fail(409, "revision_conflict", "另一处编辑已更新记录，请先查看冲突。");
      if (roundId) {
        const r = this.round(uid, roundId);
        if (r.question_id !== q.questionId)
          fail(400, "invalid_question", "题目与问答不匹配。");
      }
      const now = this.stamp();
      if (!existing) {
        if (
          roundId &&
          this.one(
            "SELECT 1 FROM entries WHERE owner=? AND round_id=?",
            uid,
            roundId,
          )
        )
          fail(409, "revision_conflict", "这轮已有私人草稿，请刷新后继续。");
        this.run(
          "INSERT INTO entries VALUES (?,?,?,?,?,?,1,'draft',?,?)",
          id,
          uid,
          q.questionId,
          roundId,
          body,
          note,
          now,
          now,
        );
      } else
        this.run(
          "UPDATE entries SET text=?,note=?,revision=revision+1,updated_at=? WHERE id=? AND owner=?",
          body,
          note,
          now,
          id,
          uid,
        );
      const saved = this.entry(uid, id);
      this.run(
        "INSERT INTO entry_revisions VALUES (?,?,?,?,?)",
        id,
        saved.revision,
        body,
        note,
        now,
      );
      return this.entryDto(saved);
    });
  }
  revisions(uid: string, id: string): EntryRevision[] {
    this.entry(uid, id);
    return this.all(
      "SELECT * FROM entry_revisions WHERE entry_id=? ORDER BY revision DESC",
      id,
    ).map((r) => ({
      entryId: id,
      revision: Number(r.revision),
      text: String(r.text),
      note: String(r.note),
      savedAt: String(r.saved_at),
    }));
  }
  submit(uid: string, id: string, data: Record<string, unknown>) {
    return this.tx(() => {
      const op = text(data.operationId, "提交编号", 100, false);
      const existing = this.one(
        "SELECT * FROM submissions WHERE round_id=? AND owner=?",
        id,
        uid,
      );
      if (existing) {
        if (existing.operation_id === op) return;
        fail(409, "snapshot_frozen", "共享版本已固定，重新分享需要新一轮。");
      }
      const r = this.openRound(uid, id);
      if (r.kind === "free" && !r.accepted_by)
        fail(409, "acceptance_required", "等待另一方接受这道题。");
      const e = this.entry(uid, text(data.entryId, "记录编号", 160, false));
      if (e.question_id !== r.question_id)
        fail(400, "invalid_question", "题目与问答不匹配。");
      if (Number(e.revision) !== number(data.expectedRevision))
        fail(409, "revision_conflict", "请先同步最新草稿。");
      if (!String(e.text).trim())
        fail(400, "empty_answer", "请先写下你的回答。");
      if (
        this.one(
          "SELECT 1 FROM submissions WHERE owner=? AND operation_id=?",
          uid,
          op,
        )
      )
        fail(409, "operation_conflict", "这个提交编号已用于另一轮。");
      this.run(
        "INSERT INTO submissions VALUES (?,?,?,?,?,?,NULL,?)",
        id,
        uid,
        e.id,
        e.text,
        e.revision,
        this.stamp(),
        op,
      );
      this.run(
        "UPDATE entries SET status='submitted' WHERE id=? AND owner=?",
        e.id,
        uid,
      );
    });
  }
  withdraw(uid: string, id: string) {
    return this.tx(() => {
      this.round(uid, id);
      if (
        !this.one(
          "SELECT 1 FROM submissions WHERE round_id=? AND owner=?",
          id,
          uid,
        )
      )
        fail(404, "not_found", "没有属于你的共享。");
      this.run(
        "UPDATE submissions SET withdrawn_at=COALESCE(withdrawn_at,?) WHERE round_id=? AND owner=?",
        this.stamp(),
        id,
        uid,
      );
      this.run("UPDATE rounds SET closed=1 WHERE id=?", id);
    });
  }
  unlocked(uid: string, id: string) {
    const r = this.round(uid, id);
    return (
      this.space(uid, String(r.space_id)).status === "active" &&
      !r.closed &&
      (r.kind === "daily" || Boolean(r.accepted_by)) &&
      this.one(
        "SELECT count(*) AS n FROM submissions WHERE round_id=? AND withdrawn_at IS NULL AND body IS NOT NULL",
        id,
      )?.n === 2
    );
  }
  readAnswer(uid: string, id: string, owner: string) {
    this.round(uid, id);
    if (owner !== uid && !this.unlocked(uid, id))
      fail(403, "locked", "双方都提交且保持共享后才能阅读。");
    const s = this.one(
      "SELECT owner,body,submitted_at,withdrawn_at FROM submissions WHERE round_id=? AND owner=? AND body IS NOT NULL",
      id,
      owner,
    );
    if (!s) fail(404, "not_found", "答案不存在。");
    return {
      owner: s.owner,
      text: s.body,
      submittedAt: s.submitted_at,
      withdrawn: Boolean(s.withdrawn_at),
    };
  }
  addComment(uid: string, id: string, data: Record<string, unknown>) {
    return this.tx(() => {
      if (!this.unlocked(uid, id))
        fail(403, "locked", "双方保持解锁时才能交流。");
      const body = text(data.text, "留言", 2000, false);
      const op = text(data.operationId, "留言编号", 100, false);
      const existing = this.one(
        "SELECT * FROM comments WHERE owner=? AND operation_id=?",
        uid,
        op,
      );
      if (existing) {
        if (existing.round_id !== id || existing.text !== body)
          fail(409, "operation_conflict", "留言编号冲突。");
        return;
      }
      const reply =
        data.replyTo === undefined
          ? null
          : text(data.replyTo, "回复编号", 160, false);
      if (
        reply &&
        !this.one("SELECT 1 FROM comments WHERE id=? AND round_id=?", reply, id)
      )
        fail(400, "invalid_reply", "追问的留言不存在。");
      this.run(
        "INSERT INTO comments VALUES (?,?,?,?,?,?,?)",
        randomUUID(),
        id,
        uid,
        body,
        reply,
        this.stamp(),
        op,
      );
    });
  }
  removeComment(uid: string, id: string) {
    if (!this.one("SELECT 1 FROM comments WHERE id=? AND owner=?", id, uid))
      fail(404, "not_found", "留言不存在。");
    this.run("DELETE FROM comments WHERE id=? AND owner=?", id, uid);
  }
  deleteEntry(uid: string, id: string) {
    return this.tx(() => {
      this.entry(uid, id);
      this.run(
        "UPDATE rounds SET closed=1 WHERE id IN (SELECT round_id FROM submissions WHERE owner=? AND entry_id=?)",
        uid,
        id,
      );
      this.run(
        "UPDATE submissions SET body=NULL,entry_id=NULL,withdrawn_at=COALESCE(withdrawn_at,?) WHERE owner=? AND entry_id=?",
        this.stamp(),
        uid,
        id,
      );
      this.run("DELETE FROM entries WHERE id=? AND owner=?", id, uid);
    });
  }
  roundView(uid: string, r: Row): SharedView {
    const id = String(r.id);
    const statuses = this.all(
      "SELECT owner,withdrawn_at FROM submissions WHERE round_id=?",
      id,
    );
    const own = statuses.find((s) => s.owner === uid),
      other = statuses.find((s) => s.owner !== uid);
    const space = this.space(uid, String(r.space_id));
    const state =
      space.status === "dissolved"
        ? "dissolved"
        : r.closed || statuses.some((s) => s.withdrawn_at)
          ? "withdrawn"
          : this.unlocked(uid, id)
            ? "unlocked"
            : own
              ? "waiting"
              : other
                ? "partner-ready"
                : "draft";
    const ownBody = this.one(
      "SELECT body,submitted_at,withdrawn_at FROM submissions WHERE round_id=? AND owner=? AND body IS NOT NULL",
      id,
      uid,
    );
    const partner =
      state === "unlocked"
        ? this.readAnswer(uid, id, String(other!.owner))
        : undefined;
    const comments = this.all(
      `SELECT * FROM comments WHERE round_id=? ${state === "unlocked" ? "" : "AND owner=?"} ORDER BY created_at,rowid`,
      ...(state === "unlocked" ? [id] : [id, uid]),
    ).map((c) => ({
      id: String(c.id),
      owner: c.owner as Profile,
      text: String(c.text),
      createdAt: String(c.created_at),
      ...(c.reply_to ? { replyTo: String(c.reply_to) } : {}),
    }));
    return {
      roundId: id,
      questionId: String(r.question_id),
      state,
      date: String(r.day),
      kind: r.kind as "daily" | "free",
      needsAcceptance:
        r.kind === "free" && !r.accepted_by && r.creator !== uid && !r.closed,
      awaitingAcceptance: r.kind === "free" && !r.accepted_by && !r.closed,
      ...(ownBody
        ? {
            own: {
              owner: uid as Profile,
              text: String(ownBody.body),
              submittedAt: String(ownBody.submitted_at),
              withdrawn: Boolean(ownBody.withdrawn_at),
            },
          }
        : {}),
      ...(partner ? { partner: partner as SharedView["partner"] } : {}),
      comments,
    };
  }
  state(uid: string): LocalState {
    const current = this.currentSpace(uid);
    let todayRoundId: string | undefined;
    if (current?.status === "active") {
      try {
        todayRoundId = this.daily(uid);
      } catch (error) {
        if (!(error instanceof ApiError) || error.code !== "plan_finished")
          throw error;
      }
    }
    const rounds = this.all(
      "SELECT r.* FROM rounds r JOIN members m ON r.space_id=m.space_id WHERE m.user_id=? ORDER BY r.created_at DESC,r.rowid DESC",
      uid,
    );
    const user = this.user(uid);
    let space: LocalSpace | undefined;
    if (current)
      space = {
        id: String(current.id),
        status: current.status as LocalSpace["status"],
        startDay: current.start_day as string | null,
        members: this.all(
          "SELECT u.id,u.name FROM members m JOIN users u ON u.id=m.user_id WHERE m.space_id=?",
          current.id,
        ).map((m) => ({ id: m.id as Profile, name: String(m.name) })),
      };
    return {
      profile: user.id,
      user,
      entries: this.all(
        "SELECT * FROM entries WHERE owner=? ORDER BY created_at,rowid",
        uid,
      ).map((e) => this.entryDto(e)),
      roundViews: rounds.map((r) => this.roundView(uid, r)),
      dissolved: !current && rounds.length > 0,
      skipped: this.all("SELECT question_id FROM skips WHERE owner=?", uid).map(
        (s) => String(s.question_id),
      ),
      serverDay: dayKey(this.now()),
      ...(space ? { space } : {}),
      ...(todayRoundId
        ? {
            todayRoundId,
            todayQuestionId: String(this.round(uid, todayRoundId).question_id),
          }
        : {}),
    };
  }
  export(uid: string, includePartner = false): LocalExport {
    const entries = this.all(
      "SELECT * FROM entries WHERE owner=? ORDER BY created_at,rowid",
      uid,
    ).map((e) => this.entryDto(e));
    const revisions = entries.flatMap((e) => this.revisions(uid, e.id));
    const submissions = this.all(
      "SELECT round_id,entry_id,body,entry_revision,submitted_at,withdrawn_at FROM submissions WHERE owner=? AND body IS NOT NULL",
      uid,
    );
    const comments = this.all(
      "SELECT id,round_id,text,reply_to,created_at FROM comments WHERE owner=?",
      uid,
    );
    const roundIds = new Set([
      ...entries.flatMap((e) => (e.roundId ? [e.roundId] : [])),
      ...submissions.map((s) => String(s.round_id)),
      ...comments.map((c) => String(c.round_id)),
    ]);
    const rounds: ExportRound[] = [...roundIds].map((id) => {
      const r = this.round(uid, id);
      const s = this.space(uid, String(r.space_id));
      return {
        roundId: id,
        questionId: String(r.question_id),
        spaceId: String(r.space_id),
        date: String(r.day),
        kind: r.kind as ExportRound["kind"],
        planVersion: String(s.plan_version),
        spaceStatus: s.status as LocalSpace["status"],
        closed: Boolean(r.closed) || s.status !== "active",
      };
    });
    const skipped = this.all(
      "SELECT question_id FROM skips WHERE owner=? ORDER BY question_id",
      uid,
    ).map((s) => String(s.question_id));
    const related = new Set([
      ...entries.map((e) => e.questionId),
      ...rounds.map((r) => r.questionId),
      ...skipped,
    ]);
    const shared = includePartner
      ? this.state(uid)
          .roundViews.filter((r) => r.state === "unlocked")
          .map((r) => ({
            roundId: r.roundId,
            questionId: r.questionId,
            partner: r.partner,
            comments: r.comments,
          }))
      : undefined;
    return {
      schemaVersion: 2,
      source: "local",
      exportedAt: this.stamp(),
      user: this.user(uid),
      entries,
      revisions,
      submissions,
      comments,
      rounds,
      skipped,
      questions: [...related].map(question),
      ...(shared ? { shared } : {}),
    };
  }
  deleteUser(uid: string) {
    return this.tx(() => {
      const current = this.currentSpace(uid);
      if (current) {
        this.run("UPDATE spaces SET status='dissolved' WHERE id=?", current.id);
        this.run("UPDATE members SET active=0 WHERE space_id=?", current.id);
        this.run("DELETE FROM invites WHERE space_id=?", current.id);
      }
      this.run(
        "UPDATE rounds SET closed=1 WHERE id IN (SELECT round_id FROM submissions WHERE owner=?)",
        uid,
      );
      this.run("DELETE FROM submissions WHERE owner=?", uid);
      this.run("DELETE FROM comments WHERE owner=?", uid);
      this.run("DELETE FROM login_attempts WHERE user_id=?", uid);
      this.run("DELETE FROM users WHERE id=?", uid);
    });
  }
}
