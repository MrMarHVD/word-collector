import { create } from "zustand";
import { readStorage, writeStorage } from "@/lib/storage";

export type ReaderWordsPerPage = "fit" | number;

export interface ReaderPreferences {
  /** wordMarkerReaderWordsPerPage: "fit" or a token count; default 250. */
  wordsPerPage: ReaderWordsPerPage;
  /** wordMarkerReaderFontSize (px); default 22. */
  fontSize: number;
  /** wordMarkerReaderSidebarCollapsed; default false. */
  sidebarCollapsed: boolean;
  /** wordMarkerReaderSidebarWidth (px); default 300. */
  sidebarWidth: number;
  /** wordMarkerReaderInfoWidth (px); default 300. */
  infoWidth: number;
  /** wordMarkerReaderPanelWidth (px, 0 = automatic); default 0. */
  panelWidth: number;
  /** wordMarkerReaderPanelHeight (px, 0 = automatic); default 0. */
  panelHeight: number;
  /** wordMarkerReaderFocusMode; default false. */
  focusMode: boolean;
  /** wordMarkerReaderFocusPanelWidth (px, 0 = automatic); default 0. */
  focusPanelWidth: number;
  /** wordMarkerReaderAutoMarkKnownOnPageTurn; default false. */
  autoMarkKnownOnPageTurn: boolean;
  /** wordMarkerReaderAutoMarkLearningOnClick; default true (only the stored string "false" disables it). */
  autoMarkLearningOnClick: boolean;
  /** wordMarkerReaderShowWordSpaces; default false. */
  showWordSpaces: boolean;
  /** wordMarkerReaderHighlightOpacity (0–1); default 0.2. */
  highlightOpacity: number;
}

/** localStorage key for each reader preference (unchanged from public/js/state.js). */
export const READER_PREFERENCE_KEYS: Record<keyof ReaderPreferences, string> = {
  wordsPerPage: "wordMarkerReaderWordsPerPage",
  fontSize: "wordMarkerReaderFontSize",
  sidebarCollapsed: "wordMarkerReaderSidebarCollapsed",
  sidebarWidth: "wordMarkerReaderSidebarWidth",
  infoWidth: "wordMarkerReaderInfoWidth",
  panelWidth: "wordMarkerReaderPanelWidth",
  panelHeight: "wordMarkerReaderPanelHeight",
  focusMode: "wordMarkerReaderFocusMode",
  focusPanelWidth: "wordMarkerReaderFocusPanelWidth",
  autoMarkKnownOnPageTurn: "wordMarkerReaderAutoMarkKnownOnPageTurn",
  autoMarkLearningOnClick: "wordMarkerReaderAutoMarkLearningOnClick",
  showWordSpaces: "wordMarkerReaderShowWordSpaces",
  highlightOpacity: "wordMarkerReaderHighlightOpacity"
};

/** Reads every reader preference with the legacy parsing and defaults. */
export function readReaderPreferences(): ReaderPreferences {
  const read = (key: keyof ReaderPreferences) => readStorage(READER_PREFERENCE_KEYS[key]);
  const wordsPerPage = read("wordsPerPage");
  return {
    wordsPerPage: wordsPerPage === "fit" ? "fit" : Number(wordsPerPage) || 250,
    fontSize: Number(read("fontSize")) || 22,
    sidebarCollapsed: read("sidebarCollapsed") === "true",
    sidebarWidth: Number(read("sidebarWidth")) || 300,
    infoWidth: Number(read("infoWidth")) || 300,
    panelWidth: Number(read("panelWidth")) || 0,
    panelHeight: Number(read("panelHeight")) || 0,
    focusMode: read("focusMode") === "true",
    focusPanelWidth: Number(read("focusPanelWidth")) || 0,
    autoMarkKnownOnPageTurn: read("autoMarkKnownOnPageTurn") === "true",
    autoMarkLearningOnClick: read("autoMarkLearningOnClick") !== "false",
    showWordSpaces: read("showWordSpaces") === "true",
    highlightOpacity: Number(read("highlightOpacity")) || 0.2
  };
}

export interface ReaderPreferencesState extends ReaderPreferences {
  /** Sets one preference and persists it as String(value), the legacy format. */
  setPreference: <K extends keyof ReaderPreferences>(key: K, value: ReaderPreferences[K]) => void;
  /** Sets and persists several preferences at once (e.g. both panel dimensions after a resize). */
  setPreferences: (values: Partial<ReaderPreferences>) => void;
}

/** Reader preferences, read once at startup and written through to their legacy localStorage keys. */
export const useReaderPreferencesStore = create<ReaderPreferencesState>((set) => ({
  ...readReaderPreferences(),
  setPreference: (key, value) => {
    writeStorage(READER_PREFERENCE_KEYS[key], String(value));
    set({ [key]: value } as Pick<ReaderPreferences, typeof key>);
  },
  setPreferences: (values) => {
    for (const [key, value] of Object.entries(values) as [keyof ReaderPreferences, unknown][]) {
      writeStorage(READER_PREFERENCE_KEYS[key], String(value));
    }
    set(values);
  }
}));
