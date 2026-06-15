/**
 * @fileoverview Internationalisation (i18n) utilities for the Word Marker SPA.
 *
 * Loads locale message catalogues from the bundled `/locales.json` file and
 * exposes helpers for translating keys, interpolating values, and formatting
 * numbers. The active locale is read from `state.locale` which is persisted in
 * `localStorage` under `wordMarkerLocale`.
 *
 * Lookup order for a missing key: active locale → Japanese (`ja`) fallback →
 * caller-supplied `fallback` string → the raw key itself.
 */

import { state } from "./state.js";

/**
 * Fetch the locale message catalogue and normalise stale persisted UI preferences.
 *
 * Loads `/locales.json` into `state.messages`. After loading it resets any
 * `localStorage`-persisted values that are no longer valid (unknown locale,
 * invalid display mode, unknown active tab, unknown reader sidebar tab, or
 * invalid theme) to their safe defaults. Must be awaited before the first call
 * to {@link t}.
 *
 * @returns {Promise<void>}
 */
// Load message catalogs and repair stale persisted UI preferences.
// Fetch locale messages and normalize stored view preferences.
export async function loadMessages() {
  state.messages = await fetchJson("/locales.json");
  if (!state.messages[state.locale]) {
    state.locale = "en";
  }
  if (!["page", "infinite"].includes(state.wordDisplayMode)) {
    state.wordDisplayMode = "infinite";
  }
  if (!["dashboard", "collections", "reader", "practice", "settings"].includes(state.activeTab)) {
    state.activeTab = "dashboard";
  }
  if (!["read", "documents", "settings"].includes(state.readerSidebarTab)) {
    state.readerSidebarTab = "read";
  }
  if (!["system", "light", "dark"].includes(state.theme)) {
    state.theme = "system";
  }
}

/**
 * Translate a message key and interpolate `{name}` placeholder values.
 *
 * Resolution order: active locale → `ja` fallback → `fallback` argument → `key`.
 * Each entry in `values` replaces occurrences of `{name}` in the resolved string.
 *
 * @param {string} key - Dot-separated message key, e.g. `"errors.requestFailed"`.
 * @param {Record<string, string|number>} [values={}] - Interpolation map.
 * @param {string} [fallback] - String to use when the key is missing in all locales.
 * @returns {string} Translated and interpolated string.
 */
// Translate a message key and interpolate simple placeholder values.
export function t(key, values = {}, fallback) {
  // Missing keys fall back to Japanese, then the supplied fallback, then the key name.
  const message = state.messages[state.locale]?.[key] || state.messages.ja?.[key] || fallback || key;
  return Object.entries(values).reduce((text, [name, value]) => {
    return text.replaceAll(`{${name}}`, value);
  }, message);
}

/**
 * Format a numeric count using the active locale's number-formatting rules.
 *
 * @param {number} value - The number to format.
 * @returns {string} Locale-formatted string, e.g. `"1,234"` for `en`.
 */
// Format counts using the active locale.
export function formatCount(value) {
  return new Intl.NumberFormat(state.locale).format(value);
}

// Fetch a JSON file from the public app.
async function fetchJson(url) {
  const response = await fetch(url);
  return response.json();
}
