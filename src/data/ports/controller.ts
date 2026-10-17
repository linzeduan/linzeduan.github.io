import type { JournalRepository } from "./journal";
import type { Entry, Profile } from "../../domain/types";
export type SaveStatus =
  | "idle"
  | "pending"
  | "saving"
  | "saved"
  | "error"
  | "conflict";
export interface JournalController extends JournalRepository {
  mode: "demo" | "local";
  subscribe: (listener: () => void) => () => void;
  getVersion: () => number;
  skip: (profile: Profile, questionId: string) => void | Promise<void>;
  reanswer: (
    profile: Profile,
    questionId: string,
    entryId?: string,
  ) => Entry | void | Promise<Entry | void>;
  dissolve: () => void | Promise<void>;
  reset: () => void;
  saveStatus: (entryId?: string) => SaveStatus;
  flush: () => Promise<void>;
}
