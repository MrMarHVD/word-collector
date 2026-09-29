import { create } from "zustand";

export type SettingsTab = "system" | "account";

interface SettingsTabState {
  /** Open settings section; kept in memory for the session like the legacy `state.settingsTab`. */
  tab: SettingsTab;
  setTab: (tab: SettingsTab) => void;
}

/** Feature-local store for the selected settings section, so it survives leaving and reopening /settings. */
export const useSettingsTabStore = create<SettingsTabState>((set) => ({
  tab: "system",
  setTab: (tab) => set({ tab })
}));
