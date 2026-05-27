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
  elements.localeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.locale = button.dataset.locale;
      localStorage.setItem("wordMarkerLocale", state.locale);
      applyLocale();
    });
  });
}
