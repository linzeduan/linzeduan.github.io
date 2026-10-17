import type { DemoSnapshot, Entry, Profile } from "../../domain/types";
export interface JournalRepository {
  snapshot(profile: Profile): DemoSnapshot;
  save(
    profile: Profile,
    questionId: string,
    text: string,
    note: string,
    expectedRevision: number,
  ): Entry;
  submit(profile: Profile, roundId: string, text: string): void;
  withdraw(profile: Profile, roundId: string): void;
  comment(
    profile: Profile,
    roundId: string,
    text: string,
    replyTo?: string,
  ): void;
  removeComment(profile: Profile, roundId: string, commentId: string): void;
  deleteEntry(profile: Profile, entryId: string): void;
  exportOwn(profile: Profile): unknown;
}
