import { create } from "zustand";
import { readStorage, writeStorage } from "@/lib/storage";

export type WordDisplayMode = "page" | "infinite";

export const WORD_DISPLAY_MODE_STORAGE_KEY = "wordMarkerDisplayMode";

export interface UiPreferencesState {
  /** Vocab word-list display mode (wordMarkerDisplayMode); anything but "page" means "infinite". Shared by vocab and settings. */
  wordDisplayMode: WordDisplayMode;
  /** Sets and persists the word-list display mode. */
  setWordDisplayMode: (mode: WordDisplayMode) => void;
}

/** Cross-feature UI preferences that are neither reader, theme nor locale settings. */
export const useUiPreferencesStore = create<UiPreferencesState>((set) => ({
  wordDisplayMode: readStorage(WORD_DISPLAY_MODE_STORAGE_KEY) === "page" ? "page" : "infinite",
  setWordDisplayMode: (mode) => {
    writeStorage(WORD_DISPLAY_MODE_STORAGE_KEY, mode);
    set({ wordDisplayMode: mode });
  }
}));
