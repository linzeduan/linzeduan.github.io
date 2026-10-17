import { describe, expect, it } from "vitest";
import { writingTarget } from "../../src/app/writing-route";
import type { Entry, SharedView } from "../../src/domain/types";

const entry: Entry = {
  id: "own-entry",
  owner: "a",
  questionId: "q057",
  roundId: "old-round",
  text: "old answer",
  note: "private",
  revision: 1,
  status: "draft",
  createdAt: "2026-10-17T15:59:59Z",
  updatedAt: "2026-10-17T15:59:59Z",
};
const privateEntry: Entry = {
  ...entry,
  id: "private-entry",
  questionId: "q014",
  roundId: undefined,
};
const rounds: SharedView[] = [
  { roundId: "old-round", questionId: "q057", state: "draft", comments: [] },
  { roundId: "new-round", questionId: "q014", state: "draft", comments: [] },
];
const defaults = { questionId: "q014", roundId: "new-round" };
const resolve = (query: string) =>
  writingTarget(
    new URLSearchParams(query),
    [entry, privateEntry],
    rounds,
    defaults,
  );
describe("writing route identity", () => {
  it("uses today's round only for an unspecified target", () => {
    expect(resolve("")).toEqual(defaults);
    expect(resolve("q=q057")).toEqual({ questionId: "q057" });
  });
  it("opens the referenced record and round independently of the new day", () => {
    expect(resolve("entry=own-entry")).toEqual({
      questionId: "q057",
      entryId: "own-entry",
      roundId: "old-round",
    });
    expect(resolve("round=old-round")).toEqual({
      questionId: "q057",
      roundId: "old-round",
    });
    expect(resolve("entry=private-entry")).toEqual({
      questionId: "q014",
      entryId: "private-entry",
    });
  });
  it.each([
    "entry=unknown",
    "round=unknown",
    "entry=",
    "round=",
    "q=q014&round=old-round",
    "q=q014&entry=own-entry",
    "entry=own-entry&round=new-round",
    "entry=private-entry&round=new-round",
  ])("rejects missing or inconsistent references: %s", (query) => {
    expect(resolve(query)).toBeUndefined();
  });
});
