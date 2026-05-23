import { state } from "./state.js";

// Load message catalogs and repair stale persisted UI preferences.
// Fetch locale messages and normalize stored view preferences.
export async function loadMessages() {
  state.messages = await fetchJson("/locales.json");
  if (!state.messages[state.locale]) {
    state.locale = "ja";
  }
  if (!["all", "infinite"].includes(state.wordDisplayMode)) {
    state.wordDisplayMode = "infinite";
  }
  if (!["dashboard", "collections", "reader", "settings"].includes(state.activeTab)) {
    state.activeTab = "dashboard";
  }
}

// Translate a message key and interpolate simple placeholder values.
export function t(key, values = {}) {
  // Missing keys fall back to Japanese, then the key name for visibility.
  const message = state.messages[state.locale]?.[key] || state.messages.ja?.[key] || key;
  return Object.entries(values).reduce((text, [name, value]) => {
    return text.replaceAll(`{${name}}`, value);
  }, message);
}

// Format counts using the active locale.
export function formatCount(value) {
  return new Intl.NumberFormat(state.locale).format(value);
}

// Fetch a JSON file from the public app.
async function fetchJson(url) {
  const response = await fetch(url);
  return response.json();
}
