import { create } from "zustand";
import { readStorage, writeStorage } from "@/lib/storage";

export const THEME_PREFERENCES = ["system", "light", "dark"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "wordMarkerTheme";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === "string" && (THEME_PREFERENCES as readonly string[]).includes(value);
}

function systemPrefersDark(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(DARK_QUERY).matches;
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? (systemPrefersDark() ? "dark" : "light") : preference;
}

/** Writes html[data-theme] (resolved colour) and html[data-theme-preference], as static/theme-init.js does before first paint. */
function applyTheme(preference: ThemePreference, resolved: ResolvedTheme): void {
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = preference;
}

export interface ThemeState {
  /** Stored preference; invalid values normalise to "system". */
  preference: ThemePreference;
  /** Effective colour scheme applied via html[data-theme]. */
  resolved: ResolvedTheme;
  /** Persists the preference under wordMarkerTheme and applies it; invalid values are ignored. */
  setTheme: (preference: ThemePreference) => void;
}

/** Theme store (system/light/dark), persisted under the legacy wordMarkerTheme key. */
export const useThemeStore = create<ThemeState>((set) => {
  const stored = readStorage(THEME_STORAGE_KEY);
  const preference: ThemePreference = isThemePreference(stored) ? stored : "system";
  return {
    preference,
    resolved: resolveTheme(preference),
    setTheme: (next) => {
      if (!isThemePreference(next)) {
        return;
      }
      const resolved = resolveTheme(next);
      writeStorage(THEME_STORAGE_KEY, next);
      applyTheme(next, resolved);
      set({ preference: next, resolved });
    }
  };
});

/**
 * Applies the stored theme and follows OS colour-scheme changes while the
 * preference is "system". Call once at startup.
 */
export function startThemeSync(): void {
  const { preference, resolved } = useThemeStore.getState();
  applyTheme(preference, resolved);
  if (typeof window.matchMedia !== "function") {
    return;
  }
  window.matchMedia(DARK_QUERY).addEventListener("change", () => {
    const current = useThemeStore.getState().preference;
    if (current !== "system") {
      return;
    }
    const next = resolveTheme(current);
    applyTheme(current, next);
    useThemeStore.setState({ resolved: next });
  });
}
