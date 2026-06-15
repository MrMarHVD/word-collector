/**
 * @fileoverview Runtime theme management for the Word Marker application.
 *
 * Provides helpers to apply, normalise, and persist the user's theme preference
 * (`"system"` | `"light"` | `"dark"`). Reads from and writes to `state.theme`
 * and persists the selection in `localStorage` under the key `wordMarkerTheme`.
 * Also manages `aria-pressed` state on the theme-picker buttons and registers a
 * `MediaQueryList` listener so the resolved colour scheme updates automatically
 * when the OS preference changes while the user has `"system"` selected.
 */

import { elements } from "./dom.js";
import { state } from "./state.js";

const THEME_OPTIONS = ["system", "light", "dark"];
const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");

function resolvedTheme() {
  return state.theme === "system" ? (systemThemeQuery.matches ? "dark" : "light") : state.theme;
}

/**
 * Ensure `state.theme` holds a valid option, resetting to `"system"` if not.
 *
 * @returns {void}
 */
export function normalizeTheme() {
  if (!THEME_OPTIONS.includes(state.theme)) {
    state.theme = "system";
  }
}

/**
 * Write the resolved theme and preference to `document.documentElement` dataset
 * attributes so CSS can apply the correct colour scheme.
 *
 * Sets `data-theme` to the effective colour (`"light"` or `"dark"`) and
 * `data-theme-preference` to the stored preference (`"system"`, `"light"`, or `"dark"`).
 *
 * @returns {void}
 */
export function applyTheme() {
  normalizeTheme();
  elements.html.dataset.theme = resolvedTheme();
  elements.html.dataset.themePreference = state.theme;
}

/**
 * Sync the `is-active` class and `aria-pressed` attribute on all theme-picker
 * buttons to reflect the current `state.theme`.
 *
 * @returns {void}
 */
export function renderThemeButtons() {
  elements.themeButtons.forEach((button) => {
    const active = button.dataset.themeOption === state.theme;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

/**
 * Persist and apply a new theme preference.
 *
 * Ignored when `theme` is not one of `"system"`, `"light"`, or `"dark"`.
 * Persists to `localStorage` under `wordMarkerTheme`, updates `state.theme`,
 * calls {@link applyTheme}, and refreshes the theme-picker button states.
 *
 * @param {"system"|"light"|"dark"} theme - The preference to activate.
 * @returns {void}
 */
export function setTheme(theme) {
  if (!THEME_OPTIONS.includes(theme)) {
    return;
  }
  state.theme = theme;
  localStorage.setItem("wordMarkerTheme", theme);
  applyTheme();
  renderThemeButtons();
}

/**
 * Register a `MediaQueryList` change listener that re-applies the theme whenever
 * the OS colour-scheme preference changes and the user has selected `"system"`.
 *
 * Should be called once during application bootstrap.
 *
 * @returns {void}
 */
export function bindSystemThemeListener() {
  systemThemeQuery.addEventListener("change", () => {
    if (state.theme === "system") {
      applyTheme();
    }
  });
}
