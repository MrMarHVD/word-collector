/**
 * @fileoverview Locale application and event binding for the Word Marker SPA.
 *
 * Applies the active locale from `state.locale` to every part of the UI:
 *   - Sets `document.documentElement.lang` and the page `<title>`.
 *   - Translates all static elements annotated with `data-i18n`, `data-i18n-placeholder`,
 *     `data-i18n-title`, and `data-i18n-aria-label` attributes.
 *   - Re-renders all dynamic views (auth, settings, study language,
 *     dashboard, reader, word list) so their text reflects the new locale.
 *
 * Locale changes are persisted to `localStorage` under `wordMarkerLocale`.
 */

import { elements } from "../dom.js";
import { t } from "../i18n.js";
import { state } from "../state.js";
import { renderThemeButtons } from "../theme.js";
import { renderAuthMode } from "../views/auth.js";
import { renderDashboard } from "../views/dashboard.js";
import { renderMaterialList, renderReaderSidebar, renderReaderSidebarTabs, renderReaderTokens } from "../views/reader.js";
import { renderDisplayModeButtons, renderLocaleButtons } from "../views/shell.js";
import { renderWords } from "../views/words.js";

let renderSettings = () => {};
let renderStudyLanguageSelect = () => {};

/**
 * Inject cross-feature render callbacks required by this module.
 *
 * Must be called once during application bootstrap before {@link applyLocale}
 * or {@link bindLocaleEvents} are invoked.
 *
 * @param {{ renderSettings: () => void, renderStudyLanguageSelect: () => void }} options
 * @returns {void}
 */
export function configureLocale(options) {
  renderSettings = options.renderSettings;
  renderStudyLanguageSelect = options.renderStudyLanguageSelect;
}

/**
 * Apply the currently active locale to the entire UI.
 *
 * Updates `document.documentElement.lang`, the page title, all i18n-annotated
 * DOM nodes, and every dynamic view. Safe to call any time the locale changes.
 *
 * @returns {void}
 */
export function applyLocale() {
  elements.html.lang = state.locale;
  elements.title.textContent = `${t("brand")} - ${t("app.title")}`;
  renderLocaleButtons();
  renderDisplayModeButtons();
  renderThemeButtons();

  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  });
  document.querySelectorAll("[data-i18n-title]").forEach((node) => {
    node.title = t(node.dataset.i18nTitle);
  });
  document.querySelectorAll("[data-i18n-aria-label]").forEach((node) => {
    node.setAttribute("aria-label", t(node.dataset.i18nAriaLabel));
  });

  renderAuthMode();
  renderSettings();
  renderStudyLanguageSelect();
  if (state.dashboard) {
    renderDashboard();
    renderReaderSidebar();
    renderReaderSidebarTabs();
    renderMaterialList();
    renderReaderTokens();
    renderWords(state.words);
  }
}

/**
 * Attach the `change` listener to the locale `<select>` element.
 *
 * Persists the selected locale to `localStorage` and calls {@link applyLocale}
 * to re-render the entire UI. Should be called once during application bootstrap.
 *
 * @returns {void}
 */
export function bindLocaleEvents() {
  elements.localeSelect.addEventListener("change", () => {
    state.locale = elements.localeSelect.value;
    localStorage.setItem("wordMarkerLocale", state.locale);
    applyLocale();
  });
}
