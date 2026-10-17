import type { DemoSnapshot, Entry, Profile } from "../../domain/types";
export interface JournalRepository {
  snapshot(profile: Profile): DemoSnapshot;
  save(
    profile: Profile,
    questionId: string,
    text: string,
    note: string,
    expectedRevision: number,
    entryId?: string,
    roundId?: string,
  ): Entry;
  submit(profile: Profile, roundId: string, text: string): void | Promise<void>;
  withdraw(profile: Profile, roundId: string): void | Promise<void>;
  comment(
    profile: Profile,
    roundId: string,
    text: string,
    replyTo?: string,
  ): void | Promise<void>;
  removeComment(
    profile: Profile,
    roundId: string,
    commentId: string,
  ): void | Promise<void>;
  deleteEntry(profile: Profile, entryId: string): void | Promise<void>;
  exportOwn(profile: Profile): unknown;
}
