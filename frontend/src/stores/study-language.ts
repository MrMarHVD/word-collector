import { useMemo } from "react";
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import * as languagesApi from "@/lib/api/languages";
import type { Language } from "@/lib/api/types";
import { readStorage, removeStorage, writeStorage } from "@/lib/storage";
import { availableStudyLanguages, languageByName } from "@/lib/study-language";

export const STUDY_LANGUAGE_STORAGE_KEY = "wordMarkerStudyLanguageName";

export interface StudyLanguageCatalog {
  /** Languages the user is enrolled in. */
  languages: Language[];
  /** Supported study-language names in canonical order. */
  studyLanguageOptions: string[];
  /** The signed-in user's native language (drives availability); null when signed out. */
  nativeLanguage: string | null;
}

export interface StudyLanguageState extends StudyLanguageCatalog {
  /** Active study language id, or null when none is selected (language-gated routes then show the welcome gate). */
  selectedId: number | null;
  /** Active study language name, persisted under wordMarkerStudyLanguageName. */
  selectedName: string;
  /** Replaces any part of the catalogue (from /api/auth/me, /api/dashboard or POST /api/languages). */
  setCatalog: (catalog: Partial<StudyLanguageCatalog>) => void;
  /**
   * Activates a study language by name (null/"" clears the selection). Returns
   * false without changes when the name is unknown, not enrolled, or
   * unavailable for the native language. Persists by default.
   */
  selectLanguage: (name: string | null, options?: { persist?: boolean }) => boolean;
  /** Re-selects the saved language if still available, else the first available one (session bootstrap). */
  restoreSelection: () => void;
  /** Activates an enrolled language and reloads the app on /dashboard, as the legacy flag buttons do. */
  switchLanguage: (name: string) => void;
  /** Enrols in a new study language (POST /api/languages), activates it and reloads on /dashboard. Rejects with ApiError. */
  addLanguage: (name: string) => Promise<void>;
  /** Clears catalogue and selection (sign-out); `forget` also removes the persisted name (account deletion). */
  reset: (options?: { forget?: boolean }) => void;
}

/** Full-page reload onto /dashboard, the legacy app's way of resetting all state after a language change. */
function reloadOnDashboard(): void {
  window.history.replaceState({}, "", "/dashboard");
  window.location.reload();
}

/** Study-language catalogue and selection. Server data beyond this lives in TanStack Query. */
export const useStudyLanguageStore = create<StudyLanguageState>((set, get) => ({
  languages: [],
  studyLanguageOptions: [],
  nativeLanguage: null,
  selectedId: null,
  selectedName: readStorage(STUDY_LANGUAGE_STORAGE_KEY) || "",
  setCatalog: (catalog) => set(catalog),
  selectLanguage: (name, { persist = true } = {}) => {
    if (!name) {
      set({ selectedId: null, selectedName: "" });
      return true;
    }
    const { languages, studyLanguageOptions, nativeLanguage } = get();
    const language = languageByName(languages, name);
    if (!language || language.name === nativeLanguage) {
      return false;
    }
    if (!availableStudyLanguages(studyLanguageOptions, languages, nativeLanguage).some((available) => available.id === language.id)) {
      return false;
    }
    if (persist) {
      writeStorage(STUDY_LANGUAGE_STORAGE_KEY, language.name);
    }
    set({ selectedId: language.id, selectedName: language.name });
    return true;
  },
  restoreSelection: () => {
    const { languages, studyLanguageOptions, nativeLanguage, selectLanguage } = get();
    const available = availableStudyLanguages(studyLanguageOptions, languages, nativeLanguage);
    const saved = readStorage(STUDY_LANGUAGE_STORAGE_KEY) || "";
    const name = available.some((language) => language.name === saved) ? saved : available[0]?.name || "";
    selectLanguage(name, { persist: true });
  },
  switchLanguage: (name) => {
    if (get().selectLanguage(name)) {
      reloadOnDashboard();
    }
  },
  addLanguage: async (name) => {
    const result = await languagesApi.add(name);
    set({ languages: result.languages || get().languages, studyLanguageOptions: result.studyLanguageOptions || get().studyLanguageOptions });
    if (get().selectLanguage(result.language?.name || name)) {
      reloadOnDashboard();
    }
  },
  reset: ({ forget = false } = {}) => {
    if (forget) {
      removeStorage(STUDY_LANGUAGE_STORAGE_KEY);
    }
    set({ languages: [], nativeLanguage: null, selectedId: null, selectedName: forget ? "" : get().selectedName });
  }
}));

/** Enrolled study languages available for the user's native language, in canonical order. */
export function useAvailableStudyLanguages(): Language[] {
  const { options, languages, nativeLanguage } = useStudyLanguageStore(
    useShallow((state) => ({ options: state.studyLanguageOptions, languages: state.languages, nativeLanguage: state.nativeLanguage }))
  );
  return useMemo(() => availableStudyLanguages(options, languages, nativeLanguage), [options, languages, nativeLanguage]);
}

/**
 * Follows study-language changes made in other browser tabs (the storage
 * event), like the legacy app. Queries keyed by the language id refetch on
 * their own. Call once at startup.
 */
export function startStudyLanguageSync(isSignedIn: () => boolean): void {
  window.addEventListener("storage", (event) => {
    if (event.key !== STUDY_LANGUAGE_STORAGE_KEY || !event.newValue || !isSignedIn()) {
      return;
    }
    if (event.newValue === useStudyLanguageStore.getState().selectedName) {
      return;
    }
    useStudyLanguageStore.getState().selectLanguage(event.newValue, { persist: false });
  });
}
