import { setUnauthorizedHandler } from "./api.js";
import { applyLocale, bindLocaleEvents, configureLocale } from "./app/locale.js";
import { activateTab } from "./app/router.js";
import { bindStudyLanguageEvents, configureStudyLanguage, renderStudyLanguageSelect } from "./app/study-language.js";
import { elements } from "./dom.js";
import { bindAuthEvents, configureAuthController, loadSession } from "./features/auth/auth.controller.js";
import { bindCollectionsEvents, configureCollectionsController, loadWords } from "./features/collections/collections.controller.js";
import { configureDashboardController, loadDashboard } from "./features/dashboard/dashboard.controller.js";
import { bindImportEvents, configureImportsController } from "./features/imports/imports.controller.js";
import { bindMaterialsEvents, configureMaterialsController, loadMaterials } from "./features/materials/materials.controller.js";
import { bindReaderEvents, configureReaderController, loadMaterialReader } from "./features/reader/reader.controller.js";
import { bindSettingsEvents, configureSettingsController, renderSettings } from "./features/settings/settings.controller.js";
import { loadMessages } from "./i18n.js";
import { applyTheme, bindSystemThemeListener, setTheme } from "./theme.js";
import { renderAuthMode } from "./views/auth.js";
import { renderReaderSidebarTabs } from "./views/reader.js";
import { renderDisplayModeButtons, resetWordWindow, showView } from "./views/shell.js";
import { renderWords } from "./views/words.js";
import { state } from "./state.js";

function bindShellEvents() {
  elements.tabButtons.forEach((button) => {
    button.addEventListener("click", () => activateTab(button.dataset.tab));
  });

  elements.themeButtons.forEach((button) => {
    button.addEventListener("click", () => setTheme(button.dataset.themeOption));
  });

  elements.displayModeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.wordDisplayMode = button.dataset.displayMode;
      localStorage.setItem("wordMarkerDisplayMode", state.wordDisplayMode);
      resetWordWindow();
      renderDisplayModeButtons();
      renderWords(state.words);
    });
  });
}

configureLocale({ renderSettings, renderStudyLanguageSelect });
configureStudyLanguage({ reloadDashboard: loadDashboard });
configureAuthController({ activateTab, loadDashboard, renderSettings });
configureDashboardController({ loadMaterials, loadWords });
configureMaterialsController({ loadDashboard, loadMaterialReader });
configureReaderController({ loadDashboard });
configureCollectionsController({ loadDashboard });
configureImportsController({ activateTab, loadDashboard });
configureSettingsController({ reloadDashboard: loadDashboard });

setUnauthorizedHandler(() => showView("auth"));
applyTheme();
bindShellEvents();
bindLocaleEvents();
bindStudyLanguageEvents();
bindAuthEvents();
bindImportEvents();
bindMaterialsEvents();
bindReaderEvents();
bindCollectionsEvents();
bindSettingsEvents();
bindSystemThemeListener();
await loadMessages();
applyLocale();
renderReaderSidebarTabs();
renderAuthMode();
await loadSession();
