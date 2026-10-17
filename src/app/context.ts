import { createContext, useContext } from "react";
import type { DemoSnapshot, Profile } from "../domain/types";
import type { JournalController } from "../data/ports/controller";
export type ConfirmAction = {
  title: string;
  description: string;
  label: string;
  action: () => unknown | Promise<unknown>;
  danger?: boolean;
};
export type AppContextValue = {
  profile: Profile;
  setProfile: (profile: Profile) => void;
  snapshot: DemoSnapshot;
  repo: JournalController;
  notify: (message: string) => void;
  run: (
    action: () => unknown | Promise<unknown>,
    message?: string,
  ) => Promise<boolean>;
  confirm: (value: ConfirmAction) => void;
};
export const AppContext = createContext<AppContextValue | null>(null);
export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error("App context is missing");
  return value;
}
