import type { DemoSnapshot, Entry, Profile } from "./types";
export type LocalUser = { id: Profile; name: string };
export type LocalSpace = {
  id: string;
  status: "waiting" | "active" | "dissolved";
  startDay: string | null;
  members: LocalUser[];
};
export type LocalState = DemoSnapshot & {
  user: LocalUser;
  space?: LocalSpace;
  serverDay: string;
  todayQuestionId?: string;
  todayRoundId?: string;
};
export type EntryRevision = {
  entryId: string;
  revision: number;
  text: string;
  note: string;
  savedAt: string;
};
export type ExportRound = {
  roundId: string;
  questionId: string;
  spaceId: string;
  date: string;
  kind: "daily" | "free";
  planVersion: string;
  spaceStatus: LocalSpace["status"];
  closed: boolean;
};
export type LocalExport = {
  schemaVersion: 2;
  source: "local";
  exportedAt: string;
  user: LocalUser;
  entries: Entry[];
  revisions: EntryRevision[];
  submissions: unknown[];
  comments: unknown[];
  rounds: ExportRound[];
  skipped: string[];
  questions: unknown[];
  shared?: unknown[];
};
