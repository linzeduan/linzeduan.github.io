import { describe, it, expect } from "vitest";
import { dayKey, dayOffset } from "../../src/domain/date";
import { DemoJournal } from "../../src/data/mock/journal";
import { questions, recommendation } from "../../src/data/catalog";
import { validateApiUrl } from "../../src/data/http/probe";

describe("Shanghai calendar", () => {
  it("switches day at Shanghai midnight regardless of host timezone", () => {
    expect(dayKey(new Date("2026-12-31T15:59:59Z"))).toBe("2026-12-31");
    expect(dayKey(new Date("2026-12-31T16:00:00Z"))).toBe("2027-01-01");
    expect(dayOffset("2026-12-31", "2027-01-01")).toBe(1);
  });
});
describe("question provenance and plan", () => {
  it("preserves all 400 numbers and excludes opt-in questions from automatic schedule", () => {
    expect(questions.map((q) => q.originalNumber)).toEqual(
      Array.from({ length: 400 }, (_, i) => i + 1),
    );
    expect(new Set(questions.map((q) => q.questionId)).size).toBe(400);
    expect(
      new Set([
        ...recommendation.automaticQuestionIds,
        ...recommendation.optInQuestionIds,
      ]).size,
    ).toBe(400);
    expect(recommendation.automaticQuestionIds).not.toContain("q133");
    expect(recommendation.automaticQuestionIds).not.toContain("q144");
    expect(recommendation.automaticQuestionIds).not.toContain("q341");
  });
});
describe("demo state model (not production authorization)", () => {
  it("omits counterpart private notes and all locked answer text", () => {
    const repo = new DemoJournal();
    repo.submit("b", "today", "B 独立的回答");
    const view = repo.snapshot("a");
    expect(view.entries.every((e) => e.owner === "a")).toBe(true);
    const today = view.roundViews.find((r) => r.roundId === "today")!;
    expect(today.state).toBe("partner-ready");
    expect(today.partner).toBeUndefined();
    expect(JSON.stringify(view)).not.toContain("B 独立的回答");
    expect(JSON.stringify(view)).not.toContain("仅属于 B");
  });
  it("requires nonempty submission, freezes snapshot and closes access on withdrawal", () => {
    const repo = new DemoJournal();
    expect(() => repo.submit("a", "today", "  ")).toThrow();
    repo.submit("a", "today", "A");
    repo.submit("b", "today", "B");
    expect(repo.snapshot("a").roundViews[0]!.partner!.text).toBe("B");
    expect(() => repo.submit("a", "today", "替换")).toThrow();
    repo.withdraw("b", "today");
    expect(repo.snapshot("a").roundViews[0]!.state).toBe("withdrawn");
    expect(repo.snapshot("a").roundViews[0]!.partner).toBeUndefined();
    expect(() => repo.comment("a", "today", "继续交流")).toThrow();
  });
  it("rejects stale edits and preserves prior answers when answering again", () => {
    const repo = new DemoJournal();
    repo.save("a", "q057", "初稿", "私人", 0);
    expect(() => repo.save("a", "q057", "覆盖", "", 0)).toThrow();
    repo.reanswer("a", "q057");
    repo.save("a", "q057", "新答案", "", 1);
    const entries = repo
      .snapshot("a")
      .entries.filter((e) => e.questionId === "q057");
    expect(entries.map((e) => e.text)).toEqual(["初稿", "新答案"]);
  });
  it("keeps personal data after dissolution and exports no counterpart contents", () => {
    const repo = new DemoJournal();
    repo.dissolve();
    expect(repo.snapshot("a").entries.length).toBeGreaterThan(0);
    expect(
      repo
        .snapshot("a")
        .roundViews.every(
          (r) => r.partner === undefined && r.state === "dissolved",
        ),
    ).toBe(true);
    const exported = repo.exportOwn("a") as {
      entries: { owner: string }[];
      comments: { owner: string }[];
    };
    expect(exported.entries.every((e) => e.owner === "a")).toBe(true);
    expect(exported.comments.every((e) => e.owner === "a")).toBe(true);
    expect(() => repo.deleteEntry("a", "b-q325")).toThrow();
  });
  it("allows deleting only own comments", () => {
    const repo = new DemoJournal();
    expect(() => repo.removeComment("a", "quiet", "seed-comment")).toThrow();
    repo.removeComment("b", "quiet", "seed-comment");
    expect(repo.snapshot("a").roundViews[1]!.comments).toHaveLength(0);
  });
  it("deletes the owner's shared snapshot as well as the private entry", () => {
    const repo = new DemoJournal();
    repo.deleteEntry("a", "a-q325");
    const exported = JSON.stringify(repo.exportOwn("a"));
    expect(exported).not.toContain("终于可以不急着回应什么");
    expect(repo.snapshot("b").roundViews[1]!.state).toBe("withdrawn");
    expect(repo.snapshot("b").entries.some((e) => e.id === "b-q325")).toBe(
      true,
    );
  });
});
describe("probe URL validation", () => {
  it("allows HTTPS or localhost and rejects credential-bearing URLs", () => {
    expect(validateApiUrl("https://example.workers.dev/")).toBe(
      "https://example.workers.dev",
    );
    expect(validateApiUrl("http://127.0.0.1:8787")).toBe(
      "http://127.0.0.1:8787",
    );
    for (const url of [
      "http://example.com",
      "https://user:pass@example.com",
      "https://example.com/probe",
      "https://example.com/?key=secret",
    ])
      expect(() => validateApiUrl(url)).toThrow();
  });
});
