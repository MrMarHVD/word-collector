import { elements } from "./dom.js";
import { state } from "./state.js";

const THEME_OPTIONS = ["system", "light", "dark"];
const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");

function resolvedTheme() {
  return state.theme === "system" ? (systemThemeQuery.matches ? "dark" : "light") : state.theme;
}

export function normalizeTheme() {
  if (!THEME_OPTIONS.includes(state.theme)) {
    state.theme = "system";
  }
}

export function applyTheme() {
  normalizeTheme();
  elements.html.dataset.theme = resolvedTheme();
  elements.html.dataset.themePreference = state.theme;
}

export function renderThemeButtons() {
  elements.themeButtons.forEach((button) => {
    const active = button.dataset.themeOption === state.theme;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

export function setTheme(theme) {
  if (!THEME_OPTIONS.includes(theme)) {
    return;
  }
  state.theme = theme;
  localStorage.setItem("wordMarkerTheme", theme);
  applyTheme();
  renderThemeButtons();
}

export function bindSystemThemeListener() {
  systemThemeQuery.addEventListener("change", () => {
    if (state.theme === "system") {
      applyTheme();
    }
  });
}
