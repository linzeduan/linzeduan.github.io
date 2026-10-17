import { createContext, useContext } from "react";
import type { DemoSnapshot, Profile } from "../domain/types";
import type { DemoJournal } from "../data/mock/journal";
export type ConfirmAction = {
  title: string;
  description: string;
  label: string;
  action: () => void;
  danger?: boolean;
};
export type AppContextValue = {
  profile: Profile;
  setProfile: (profile: Profile) => void;
  snapshot: DemoSnapshot;
  repo: DemoJournal;
  notify: (message: string) => void;
  run: (action: () => void, message?: string) => boolean;
  confirm: (value: ConfirmAction) => void;
};
export const AppContext = createContext<AppContextValue | null>(null);
export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error("App context is missing");
  return value;
}
