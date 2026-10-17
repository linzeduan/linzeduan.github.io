import type { JournalController, SaveStatus } from "../ports/controller";
import type { DemoSnapshot, Entry, Profile } from "../../domain/types";
import type {
  EntryRevision,
  LocalState,
  LocalUser,
  LocalExport,
} from "../../domain/local";
import { LocalApiError, localRequest } from "./local-api";

type Draft = {
  entry: Entry;
  serverRevision: number;
  generation: number;
  timer?: ReturnType<typeof setTimeout>;
  sending?: Promise<void>;
  error?: LocalApiError;
};
export class ConnectedJournal implements JournalController {
  mode = "local" as const;
  user: LocalUser;
  state: LocalState;
  connectionError = "";
  private listeners = new Set<() => void>();
  private version = 0;
  private drafts = new Map<string, Draft>();
  private operations = new Map<string, string>();
  private readGeneration = 0;
  private disposed = false;
  onUnauthorized: () => void;
  onSignedOut: () => void;
  constructor(
    user: LocalUser,
    onUnauthorized: () => void,
    onSignedOut = onUnauthorized,
  ) {
    this.user = user;
    this.onUnauthorized = onUnauthorized;
    this.onSignedOut = onSignedOut;
    this.state = {
      profile: user.id,
      user,
      entries: [],
      roundViews: [],
      dissolved: false,
      skipped: [],
      serverDay: "",
    };
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getVersion = () => this.version;
  private changed() {
    if (!this.disposed) {
      this.version++;
      this.listeners.forEach((listener) => listener());
    }
  }
  snapshot(_profile: Profile): DemoSnapshot {
    return structuredClone(this.state);
  }
  private maskPartner() {
    this.state.roundViews = this.state.roundViews.map((r) => {
      const { partner: _, ...own } = r;
      return {
        ...own,
        state: r.state === "unlocked" ? "unavailable" : r.state,
        comments: r.comments.filter((c) => c.owner === this.user.id),
      };
    });
  }
  hidePartner() {
    this.readGeneration++;
    this.maskPartner();
    this.changed();
  }
  async refresh() {
    const generation = ++this.readGeneration;
    try {
      const remote = await localRequest<LocalState>("/state");
      if (this.disposed || generation !== this.readGeneration) return;
      for (const draft of this.drafts.values()) {
        remote.entries = remote.entries.filter((e) => e.id !== draft.entry.id);
        remote.entries.push(draft.entry);
      }
      this.state = remote;
      this.connectionError = "";
      this.changed();
    } catch (error) {
      if (this.disposed || generation !== this.readGeneration) return;
      this.connectionError =
        error instanceof Error ? error.message : "同步未完成。";
      this.maskPartner();
      this.changed();
      if (error instanceof LocalApiError && error.status === 401)
        this.onUnauthorized();
      throw error;
    }
  }
  save(
    _profile: Profile,
    questionId: string,
    text: string,
    note: string,
    expectedRevision: number,
    entryId?: string,
    roundId?: string,
  ): Entry {
    if (text.length > 12000 || note.length > 12000)
      throw new Error("每项内容最多 12000 字。");
    const previous = this.state.entries.findLast((e) =>
      entryId
        ? e.id === entryId
        : e.questionId === questionId &&
          (roundId ? e.roundId === roundId : !e.roundId),
    );
    if ((previous?.revision ?? 0) !== expectedRevision)
      throw new Error("这份记录已经更新，请重新查看。");
    const id = previous?.id ?? crypto.randomUUID();
    const stamp = new Date().toISOString();
    const entry: Entry = {
      id,
      owner: this.user.id,
      questionId,
      text,
      note,
      revision: expectedRevision + 1,
      status: previous?.status ?? "draft",
      createdAt: previous?.createdAt ?? stamp,
      updatedAt: stamp,
      ...((previous?.roundId ?? roundId)
        ? { roundId: previous?.roundId ?? roundId }
        : {}),
    };
    let draft = this.drafts.get(id);
    if (!draft) {
      draft = { entry, serverRevision: previous?.revision ?? 0, generation: 0 };
      this.drafts.set(id, draft);
    }
    draft.entry = entry;
    draft.generation++;
    if (draft.timer) clearTimeout(draft.timer);
    if (draft.error?.code !== "revision_conflict")
      draft.timer = setTimeout(() => {
        void this.flushOne(id).catch(() => {});
      }, 500);
    this.state.entries = this.state.entries.filter((e) => e.id !== id);
    this.state.entries.push(entry);
    this.changed();
    return structuredClone(entry);
  }
  saveStatus = (id?: string): SaveStatus => {
    const draft = id ? this.drafts.get(id) : undefined;
    return draft?.error?.code === "revision_conflict"
      ? "conflict"
      : draft?.error
        ? "error"
        : draft?.sending
          ? "saving"
          : draft
            ? "pending"
            : id
              ? "saved"
              : "idle";
  };
  hasPending() {
    return this.drafts.size > 0;
  }
  private async flushOne(id: string): Promise<void> {
    const draft = this.drafts.get(id);
    if (!draft) return;
    if (draft.timer) clearTimeout(draft.timer);
    if (draft.sending) {
      await draft.sending;
      if (this.drafts.has(id)) return this.flushOne(id);
      return;
    }
    if (draft.error?.code === "revision_conflict") throw draft.error;
    const generation = draft.generation;
    const entry = structuredClone(draft.entry);
    draft.error = undefined;
    const sending = (async () => {
      try {
        const saved = await localRequest<Entry>("/entries", "POST", {
          id,
          questionId: entry.questionId,
          text: entry.text,
          note: entry.note,
          expectedRevision: draft.serverRevision,
          ...(entry.roundId ? { roundId: entry.roundId } : {}),
        });
        this.readGeneration++;
        draft.serverRevision = saved.revision;
        if (draft.generation === generation) {
          this.drafts.delete(id);
          this.state.entries = this.state.entries.filter((e) => e.id !== id);
          this.state.entries.push(saved);
        }
      } catch (error) {
        draft.error =
          error instanceof LocalApiError
            ? error
            : new LocalApiError(0, "save_failed", "草稿尚未同步。");
        if (draft.error.status === 401) this.onUnauthorized();
        throw draft.error;
      } finally {
        draft.sending = undefined;
        this.changed();
      }
    })();
    draft.sending = sending;
    this.changed();
    await sending;
    if (this.drafts.has(id) && !draft.error) return this.flushOne(id);
  }
  flush = async () => {
    for (const id of [...this.drafts.keys()]) await this.flushOne(id);
  };
  async reloadEntry(id: string) {
    const draft = this.drafts.get(id);
    if (draft?.timer) clearTimeout(draft.timer);
    await draft?.sending?.catch(() => {});
    const remote = await localRequest<LocalState>("/state");
    this.readGeneration++;
    this.drafts.delete(id);
    for (const other of this.drafts.values()) {
      remote.entries = remote.entries.filter((e) => e.id !== other.entry.id);
      remote.entries.push(other.entry);
    }
    this.state = remote;
    this.connectionError = "";
    this.changed();
  }
  pendingCopy(id: string) {
    return {
      schemaVersion: 1,
      source: "unsynced-local-draft",
      entry:
        this.drafts.get(id)?.entry ??
        this.state.entries.find((e) => e.id === id),
    };
  }
  private operation(key: string) {
    let id = this.operations.get(key);
    if (!id) {
      id = crypto.randomUUID();
      this.operations.set(key, id);
    }
    return id;
  }
  async submit(_profile: Profile, roundId: string, text: string) {
    await this.flush();
    const round = this.state.roundViews.find((r) => r.roundId === roundId);
    const entry = this.state.entries.findLast(
      (e) =>
        e.roundId === roundId &&
        e.questionId === round?.questionId &&
        e.text === text,
    );
    if (!entry) throw new Error("请先保存自己的回答。");
    const key = `submit:${roundId}`;
    await localRequest(
      `/rounds/${encodeURIComponent(roundId)}/submit`,
      "POST",
      {
        entryId: entry.id,
        expectedRevision: entry.revision,
        operationId: this.operation(key),
      },
    );
    await this.refresh();
    this.operations.delete(key);
  }
  async withdraw(_profile: Profile, roundId: string) {
    await localRequest(
      `/rounds/${encodeURIComponent(roundId)}/withdraw`,
      "POST",
      {},
    );
    await this.refresh();
  }
  async comment(
    _profile: Profile,
    roundId: string,
    text: string,
    replyTo?: string,
  ) {
    const key = `comment:${roundId}:${replyTo ?? ""}:${text}`;
    await localRequest(
      `/rounds/${encodeURIComponent(roundId)}/comments`,
      "POST",
      {
        text,
        operationId: this.operation(key),
        ...(replyTo ? { replyTo } : {}),
      },
    );
    await this.refresh();
    this.operations.delete(key);
  }
  async removeComment(_profile: Profile, _roundId: string, id: string) {
    await localRequest(`/comments/${encodeURIComponent(id)}`, "DELETE");
    await this.refresh();
  }
  async deleteEntry(_profile: Profile, id: string) {
    const draft = this.drafts.get(id);
    if (draft?.timer) clearTimeout(draft.timer);
    await draft?.sending?.catch(() => {});
    try {
      await localRequest(`/entries/${encodeURIComponent(id)}`, "DELETE");
    } catch (error) {
      if (
        !(
          error instanceof LocalApiError &&
          error.status === 404 &&
          draft?.serverRevision === 0
        )
      )
        throw error;
    }
    this.drafts.delete(id);
    await this.refresh();
  }
  async exportOwn(_profile: Profile, includePartner = false) {
    await this.flush();
    return localRequest<LocalExport>(
      `/export${includePartner ? "?includePartner=true" : ""}`,
    );
  }
  async skip(_profile: Profile, questionId: string) {
    await localRequest("/skips", "POST", { questionId });
    await this.refresh();
  }
  async reanswer(_profile: Profile, questionId: string, entryId?: string) {
    await this.flush();
    const previous = entryId
      ? this.state.entries.find((e) => e.id === entryId)
      : this.state.entries.findLast((e) => e.questionId === questionId);
    const entry = previous
      ? await localRequest<Entry>(
          `/entries/${encodeURIComponent(previous.id)}/reanswer`,
          "POST",
          {},
        )
      : await localRequest<Entry>("/entries", "POST", {
          id: crypto.randomUUID(),
          questionId,
          text: "",
          note: "",
          expectedRevision: 0,
        });
    await this.refresh();
    return entry;
  }
  async dissolve() {
    if (!this.state.space) throw new Error("没有活动空间。");
    await localRequest(
      `/spaces/${encodeURIComponent(this.state.space.id)}/dissolve`,
      "POST",
      { confirmation: "DISSOLVE_SPACE" },
    );
    await this.refresh();
  }
  reset() {
    throw new Error("本地数据不能通过演示还原操作清除。");
  }
  revisions(id: string) {
    return localRequest<EntryRevision[]>(
      `/entries/${encodeURIComponent(id)}/revisions`,
    );
  }
  async createSpace() {
    await localRequest("/spaces", "POST", {});
    await this.refresh();
  }
  invite() {
    return localRequest<{ code: string; expiresAt: number }>(
      "/spaces/invite",
      "POST",
      {},
    );
  }
  async join(code: string) {
    await localRequest("/spaces/join", "POST", { code });
    await this.refresh();
  }
  async daily(date: string) {
    const value = await localRequest<{ id: string }>("/rounds/daily", "POST", {
      date,
    });
    await this.refresh();
    return value.id;
  }
  async free(
    questionId: string,
    sensitiveConsent: boolean,
    sourceEntryId?: string,
  ) {
    await this.flush();
    const source = sourceEntryId
      ? this.state.entries.find((e) => e.id === sourceEntryId)
      : undefined;
    if (sourceEntryId && (!source || source.questionId !== questionId))
      throw new Error("原记录已变化，请重新打开后再邀请。");
    const key = `free:${this.state.space?.id}:${questionId}:${sourceEntryId ?? ""}`;
    const value = await localRequest<{ id: string }>("/rounds/free", "POST", {
      questionId,
      sensitiveConsent,
      roundId: this.operation(key),
      ...(source
        ? { sourceEntryId: source.id, expectedRevision: source.revision }
        : {}),
    });
    await this.refresh();
    this.operations.delete(key);
    return value.id;
  }
  async accept(roundId: string, consent: boolean) {
    await localRequest(
      `/rounds/${encodeURIComponent(roundId)}/accept`,
      "POST",
      { consent },
    );
    await this.refresh();
  }
  async decline(roundId: string) {
    await localRequest(
      `/rounds/${encodeURIComponent(roundId)}/decline`,
      "POST",
      {},
    );
    await this.refresh();
  }
  async logout() {
    await this.flush();
    await localRequest("/logout", "POST");
    this.dispose();
    this.onSignedOut();
  }
  dispose() {
    this.disposed = true;
    this.readGeneration++;
    for (const d of this.drafts.values()) if (d.timer) clearTimeout(d.timer);
    this.drafts.clear();
    this.state.entries = [];
    this.state.roundViews = [];
    this.listeners.clear();
  }
}
