import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectedJournal } from "../../src/data/http/connected-journal";
import { LocalApiError, localRequest } from "../../src/data/http/local-api";
import type { Entry } from "../../src/domain/types";
import type { LocalState } from "../../src/domain/local";

vi.mock("../../src/data/http/local-api", async (original) => ({
  ...(await original<typeof import("../../src/data/http/local-api")>()),
  localRequest: vi.fn(),
}));
const request = vi.mocked(localRequest);
const controllers: ConnectedJournal[] = [];
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function fixture() {
  const expired = vi.fn();
  const repo = new ConnectedJournal({ id: "a", name: "A" }, expired);
  controllers.push(repo);
  const entry: Entry = {
    id: "draft-1",
    owner: "a",
    questionId: "q057",
    roundId: "round-1",
    text: "original",
    note: "private",
    revision: 1,
    status: "draft",
    createdAt: "2026-10-17T04:00:00Z",
    updatedAt: "2026-10-17T04:00:00Z",
  };
  const state: LocalState = {
    profile: "a",
    user: repo.user,
    entries: [entry],
    skipped: [],
    dissolved: false,
    serverDay: "2026-10-17",
    roundViews: [
      {
        roundId: "round-1",
        questionId: "q057",
        state: "unlocked",
        comments: [],
        partner: {
          owner: "b",
          text: "shared B",
          submittedAt: entry.createdAt,
          withdrawn: false,
        },
      },
    ],
  };
  repo.state = structuredClone(state);
  const save = (text: string) => {
    const current = repo.state.entries.find((e) => e.id === entry.id)!;
    return repo.save(
      "a",
      entry.questionId,
      text,
      "private",
      current.revision,
      entry.id,
      entry.roundId,
    );
  };
  return { repo, entry, state, save, expired };
}
afterEach(() => {
  controllers.splice(0).forEach((repo) => repo.dispose());
  vi.resetAllMocks();
});
describe("connected drafts and private state", () => {
  it("serializes typing during an in-flight save without losing the newer input", async () => {
    const { repo, entry, save } = fixture();
    const first = deferred<Entry>();
    request
      .mockReturnValueOnce(first.promise)
      .mockImplementationOnce(async (_path, _method, body) => {
        const value = body as { text: string; expectedRevision: number };
        return {
          ...entry,
          text: value.text,
          revision: value.expectedRevision + 1,
        };
      });
    save("first edit");
    const flushing = repo.flush();
    save("latest typing");
    first.resolve({ ...entry, text: "first edit", revision: 2 });
    await flushing;
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1]![2]).toMatchObject({
      text: "latest typing",
      expectedRevision: 2,
    });
    expect(repo.state.entries[0]).toMatchObject({
      text: "latest typing",
      revision: 3,
    });
    expect(repo.hasPending()).toBe(false);
  });
  it("ignores a stale poll after a save has been acknowledged", async () => {
    const { repo, state, entry, save } = fixture();
    const stale = deferred<LocalState>();
    request
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce({ ...entry, text: "new", revision: 2 });
    const reading = repo.refresh();
    save("new");
    await repo.flush();
    stale.resolve(state);
    await reading;
    expect(repo.state.entries[0]?.text).toBe("new");
  });
  it("keeps unsaved text on network failure, failed reload and failed deletion", async () => {
    const { repo, entry, save } = fixture();
    const failure = new LocalApiError(0, "network_error", "offline");
    request.mockRejectedValue(failure);
    save("keep my input");
    await expect(repo.flush()).rejects.toThrow("offline");
    await expect(repo.reloadEntry(entry.id)).rejects.toThrow("offline");
    await expect(repo.deleteEntry("a", entry.id)).rejects.toThrow("offline");
    expect(repo.pendingCopy(entry.id).entry?.text).toBe("keep my input");
    expect(repo.saveStatus(entry.id)).toBe("error");
  });
  it("blocks automatic conflict overwrite until an explicit successful reload", async () => {
    const { repo, state, entry, save } = fixture();
    request.mockRejectedValueOnce(
      new LocalApiError(409, "revision_conflict", "conflict"),
    );
    save("my conflicting version");
    await expect(repo.flush()).rejects.toThrow("conflict");
    save("still editing");
    await expect(repo.flush()).rejects.toThrow("conflict");
    expect(request).toHaveBeenCalledTimes(1);
    expect(repo.pendingCopy(entry.id).entry?.text).toBe("still editing");
    request.mockResolvedValueOnce({
      ...state,
      entries: [{ ...entry, text: "remote", revision: 3 }],
    });
    await repo.reloadEntry(entry.id);
    expect(repo.state.entries[0]?.text).toBe("remote");
    expect(repo.hasPending()).toBe(false);
  });
  it("retains drafts through expired authentication and retries after login", async () => {
    const { repo, entry, save, expired } = fixture();
    request.mockRejectedValueOnce(
      new LocalApiError(401, "unauthorized", "login again"),
    );
    save("protected draft");
    await expect(repo.flush()).rejects.toThrow("login again");
    expect(expired).toHaveBeenCalledOnce();
    expect(repo.pendingCopy(entry.id).entry?.text).toBe("protected draft");
    request.mockResolvedValueOnce({
      ...entry,
      text: "protected draft",
      revision: 2,
    });
    await repo.flush();
    expect(repo.hasPending()).toBe(false);
  });
  it("does not restore partner content from a poll started before the tab was hidden", async () => {
    const { repo, state } = fixture();
    const pending = deferred<LocalState>();
    request.mockReturnValueOnce(pending.promise);
    const reading = repo.refresh();
    repo.hidePartner();
    pending.resolve(state);
    await reading;
    expect(repo.state.roundViews[0]?.partner).toBeUndefined();
    expect(repo.state.roundViews[0]?.state).toBe("unavailable");
  });
});
