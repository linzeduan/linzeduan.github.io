import type {
  Comment,
  DemoSnapshot,
  Entry,
  Profile,
  Round,
} from "../../domain/types";
import type { JournalRepository } from "../ports/journal";
import { dayKey } from "../../domain/date";
import { requireText, sharedView } from "../../domain/sharing";
import { getQuestion } from "../catalog";

// Deliberately in-memory and synthetic. This is NOT an authorization boundary.
export class DemoJournal implements JournalRepository {
  mode = "demo" as const;
  flush = async () => {};
  saveStatus = () => "saved" as const;
  private entries: Entry[] = [];
  private rounds: Round[] = [];
  private skipped: Record<Profile, string[]> = { a: [], b: [] };
  private dissolved = false;
  private listeners = new Set<() => void>();
  private version = 0;
  constructor() {
    this.reset();
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getVersion = () => this.version;
  private changed() {
    this.version++;
    this.listeners.forEach((listener) => listener());
  }
  reset() {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 86400000).toISOString();
    const earlier = new Date(now.getTime() - 3 * 86400000).toISOString();
    this.entries = [
      {
        id: "a-q325",
        questionId: "q325",
        owner: "a",
        text: "安静一些吧。偶尔放一张很熟悉的专辑，声音小到刚好能听见。一个人待着的时候，终于可以不急着回应什么。",
        note: "也许，安静是我重新找回自己的方式。",
        createdAt: earlier,
        updatedAt: earlier,
        revision: 1,
        status: "submitted",
      },
      {
        id: "b-q325",
        questionId: "q325",
        owner: "b",
        text: "我喜欢轻轻放着音乐，最好是一首没有歌词的曲子。那种安静里有一点陪伴的感觉。",
        note: "这是一条仅属于 B 的演示笔记。",
        createdAt: earlier,
        updatedAt: earlier,
        revision: 1,
        status: "submitted",
      },
      {
        id: "a-q363",
        questionId: "q363",
        owner: "a",
        text: "会。路过的树影、晚饭前的一小片天空，还有偶然看到的有趣招牌。照片不一定拍得好，但那一刻是真的想留下来。",
        note: "下次散步，试着只拍三张。",
        createdAt: yesterday,
        updatedAt: yesterday,
        revision: 1,
        status: "draft",
      },
    ];
    this.rounds = [
      {
        id: "today",
        questionId: "q057",
        date: dayKey(now),
        submissions: {},
        comments: [],
        closed: false,
      },
      {
        id: "quiet",
        questionId: "q325",
        date: dayKey(new Date(earlier)),
        submissions: {
          a: {
            owner: "a",
            text: this.entries[0]!.text,
            submittedAt: earlier,
            withdrawn: false,
          },
          b: {
            owner: "b",
            text: this.entries[1]!.text,
            submittedAt: earlier,
            withdrawn: false,
          },
        },
        comments: [
          {
            id: "seed-comment",
            owner: "b",
            text: "“不急着回应什么”，我很喜欢这句话。",
            createdAt: yesterday,
          },
        ],
        closed: false,
      },
    ];
    this.dissolved = false;
    this.skipped = { a: [], b: [] };
    this.changed();
  }
  snapshot(profile: Profile): DemoSnapshot {
    return structuredClone({
      profile,
      entries: this.entries.filter((e) => e.owner === profile),
      roundViews: this.rounds.map((r) =>
        sharedView(r, profile, this.dissolved),
      ),
      dissolved: this.dissolved,
      skipped: this.skipped[profile],
    });
  }
  save(
    profile: Profile,
    questionId: string,
    text: string,
    note: string,
    expectedRevision: number,
    entryId?: string,
  ): Entry {
    getQuestion(questionId);
    if (text.length > 12000 || note.length > 12000)
      throw new Error("每项内容最多 12000 字。");
    let entry = this.entries.findLast(
      (e) =>
        e.owner === profile &&
        e.questionId === questionId &&
        (!entryId || e.id === entryId),
    );
    if ((entry?.revision ?? 0) !== expectedRevision)
      throw new Error("另一处编辑已更新这份记录，请先重新查看。");
    const now = new Date().toISOString();
    if (entry) {
      entry.text = text;
      entry.note = note;
      entry.updatedAt = now;
      entry.revision++;
    } else {
      entry = {
        id: crypto.randomUUID(),
        questionId,
        owner: profile,
        text,
        note,
        createdAt: now,
        updatedAt: now,
        revision: 1,
        status: "draft",
      };
      this.entries.push(entry);
    }
    this.changed();
    return structuredClone(entry);
  }
  private round(id: string) {
    const round = this.rounds.find((r) => r.id === id);
    if (!round) throw new Error("没有找到这轮问答。");
    return round;
  }
  submit(profile: Profile, roundId: string, text: string) {
    requireText(text);
    const round = this.round(roundId);
    if (this.dissolved || round.closed) throw new Error("这轮交流已经关闭。");
    if (round.submissions[profile])
      throw new Error("已正式提交；重新分享请开启新一轮。");
    round.submissions[profile] = {
      owner: profile,
      text,
      submittedAt: new Date().toISOString(),
      withdrawn: false,
    };
    const entry = this.entries.findLast(
      (e) => e.owner === profile && e.questionId === round.questionId,
    );
    if (entry) entry.status = "submitted";
    this.changed();
  }
  withdraw(profile: Profile, roundId: string) {
    const round = this.round(roundId);
    const own = round.submissions[profile];
    if (!own) throw new Error("你还没有共享这份答案。");
    own.withdrawn = true;
    round.closed = true;
    this.changed();
  }
  comment(profile: Profile, roundId: string, text: string, replyTo?: string) {
    requireText(text, 2000);
    const round = this.round(roundId);
    if (sharedView(round, profile, this.dissolved).state !== "unlocked")
      throw new Error("双方保持解锁时才能交流。");
    if (replyTo && !round.comments.some((c) => c.id === replyTo))
      throw new Error("追问对应的留言不存在。");
    round.comments.push({
      id: crypto.randomUUID(),
      owner: profile,
      text,
      createdAt: new Date().toISOString(),
      ...(replyTo ? { replyTo } : {}),
    });
    this.changed();
  }
  removeComment(profile: Profile, roundId: string, commentId: string) {
    const round = this.round(roundId);
    const comment = round.comments.find((c) => c.id === commentId);
    if (!comment || comment.owner !== profile)
      throw new Error("只能删除自己的留言。");
    round.comments = round.comments.filter((c) => c.id !== commentId);
    this.changed();
  }
  deleteEntry(profile: Profile, entryId: string) {
    const entry = this.entries.find(
      (e) => e.id === entryId && e.owner === profile,
    );
    if (!entry) throw new Error("无法删除这条记录。");
    for (const round of this.rounds.filter(
      (r) => r.questionId === entry.questionId && r.submissions[profile],
    )) {
      round.closed = true;
      delete round.submissions[profile];
    }
    this.entries = this.entries.filter((e) => e.id !== entryId);
    this.changed();
  }
  skip(profile: Profile, questionId: string) {
    getQuestion(questionId);
    if (!this.skipped[profile].includes(questionId))
      this.skipped[profile].push(questionId);
    this.changed();
  }
  reanswer(profile: Profile, questionId: string) {
    getQuestion(questionId);
    const now = new Date().toISOString();
    this.entries.push({
      id: crypto.randomUUID(),
      questionId,
      owner: profile,
      text: "",
      note: "",
      createdAt: now,
      updatedAt: now,
      revision: 1,
      status: "draft",
    });
    this.changed();
  }
  dissolve() {
    this.dissolved = true;
    this.changed();
  }
  exportOwn(profile: Profile) {
    const entries = this.entries.filter((e) => e.owner === profile);
    const comments: (Comment & { roundId: string; questionId: string })[] =
      this.rounds.flatMap((r) =>
        r.comments
          .filter((c) => c.owner === profile)
          .map((c) => ({ ...c, roundId: r.id, questionId: r.questionId })),
      );
    return {
      schemaVersion: 1,
      mode: "demo",
      exportedAt: new Date().toISOString(),
      profile,
      entries,
      questions: [...new Set(entries.map((e) => e.questionId))].map(
        getQuestion,
      ),
      submissions: this.rounds.flatMap((r) =>
        r.submissions[profile]
          ? [
              {
                roundId: r.id,
                questionId: r.questionId,
                ...r.submissions[profile],
              },
            ]
          : [],
      ),
      comments,
    };
  }
}
export const demoJournal = new DemoJournal();
