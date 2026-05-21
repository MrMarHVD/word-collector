import { state } from "./state.js";

export async function loadMessages() {
  state.messages = await fetchJson("/locales.json");
  if (!state.messages[state.locale]) {
    state.locale = "ja";
  }
  if (!["all", "infinite"].includes(state.wordDisplayMode)) {
    state.wordDisplayMode = "infinite";
  }
  if (!["dashboard", "collections", "settings"].includes(state.activeTab)) {
    state.activeTab = "dashboard";
  }
}

export function t(key, values = {}) {
  const message = state.messages[state.locale]?.[key] || state.messages.ja?.[key] || key;
  return Object.entries(values).reduce((text, [name, value]) => {
    return text.replaceAll(`{${name}}`, value);
  }, message);
}

export function formatCount(value) {
  return new Intl.NumberFormat(state.locale).format(value);
}

async function fetchJson(url) {
  const response = await fetch(url);
  return response.json();
}
