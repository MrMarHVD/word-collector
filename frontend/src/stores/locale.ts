import { create } from "zustand";
import { readStorage, writeStorage } from "@/lib/storage";

/** Supported UI locales, in the order the legacy locale select lists them. */
export const LOCALES = ["en", "zh", "ja"] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_STORAGE_KEY = "wordMarkerLocale";
export const DEFAULT_LOCALE: Locale = "en";

/** Narrows an arbitrary value to a supported locale. */
export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export interface LocaleState {
  /** Active UI locale; unknown persisted values fall back to "en" like the legacy app. */
  locale: Locale;
  /** Switches the UI locale and persists it under wordMarkerLocale. */
  setLocale: (locale: Locale) => void;
}

/** UI locale store, persisted under the legacy wordMarkerLocale key. */
export const useLocaleStore = create<LocaleState>((set) => {
  const stored = readStorage(LOCALE_STORAGE_KEY);
  return {
    locale: isLocale(stored) ? stored : DEFAULT_LOCALE,
    setLocale: (locale) => {
      writeStorage(LOCALE_STORAGE_KEY, locale);
      set({ locale });
    }
  };
});
