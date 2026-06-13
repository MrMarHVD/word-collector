import { elements } from "../dom.js";
import { t } from "../i18n.js";
import { state } from "../state.js";
import { renderThemeButtons } from "../theme.js";
import { renderAuthMode } from "../views/auth.js";
import { renderDashboard } from "../views/dashboard.js";
import { renderOnboarding } from "../views/onboarding.js";
import { renderMaterialList, renderReaderSidebar, renderReaderSidebarTabs, renderReaderTokens } from "../views/reader.js";
import { renderDisplayModeButtons, renderLocaleButtons } from "../views/shell.js";
import { renderWords } from "../views/words.js";

let renderSettings = () => {};
let renderStudyLanguageSelect = () => {};

export function configureLocale(options) {
  renderSettings = options.renderSettings;
  renderStudyLanguageSelect = options.renderStudyLanguageSelect;
}

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
  renderOnboarding(state.predefinedLanguages);
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

export function bindLocaleEvents() {
  elements.localeSelect.addEventListener("change", () => {
    state.locale = elements.localeSelect.value;
    localStorage.setItem("wordMarkerLocale", state.locale);
    applyLocale();
  });
}
