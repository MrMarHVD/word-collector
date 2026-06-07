import { setUnauthorizedHandler } from "./api.js";
import { applyLocale, bindLocaleEvents, configureLocale } from "./app/locale.js";
import { navigateToTab, resolveInitialTab, startRouter } from "./app/router.js";
import { bindStudyLanguageEvents, configureStudyLanguage, renderStudyLanguageSelect } from "./app/study-language.js";
import { elements } from "./dom.js";
import { bindAuthEvents, configureAuthController, consumeVerificationToken, loadSession, openResetPassword, showOAuthError, showVerificationResult } from "./features/auth/auth.controller.js";
import { bindCollectionsEvents, configureCollectionsController, loadWords } from "./features/collections/collections.controller.js";
import { configureDashboardController, loadDashboard } from "./features/dashboard/dashboard.controller.js";
import { bindImportEvents, configureImportsController } from "./features/imports/imports.controller.js";
import { bindMaterialsEvents, configureMaterialsController, loadMaterials } from "./features/materials/materials.controller.js";
import { bindPracticeEvents, configurePracticeController } from "./features/practice/practice.controller.js";
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
    button.addEventListener("click", () => navigateToTab(button.dataset.tab));
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
configureAuthController({ loadDashboard, renderSettings });
configureDashboardController({ loadMaterials, loadWords });
configureMaterialsController({ loadDashboard, loadMaterialReader, loadWords });
configureReaderController({ loadDashboard });
configureCollectionsController({ loadDashboard });
configureImportsController({ loadDashboard });
configurePracticeController({ loadDashboard });
configureSettingsController({ reloadDashboard: loadDashboard });

setUnauthorizedHandler(() => showView("welcome"));
startRouter();
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
bindPracticeEvents();
bindSystemThemeListener();
await loadMessages();
applyLocale();
renderReaderSidebarTabs();
renderAuthMode();

// Emailed verification / password-reset links land on the app root carrying
// their token as a query parameter. Consume it, then strip it from the URL so
// the token is not left in history or re-triggered on reload.
const authParams = new URLSearchParams(window.location.search);
const resetToken = authParams.get("reset_token");
const verifyToken = authParams.get("verify_token");
const oauthError = authParams.get("oauth_error");
if (resetToken || verifyToken || oauthError || authParams.get("oauth")) {
  window.history.replaceState({}, "", window.location.pathname);
}

if (resetToken) {
  openResetPassword(resetToken);
} else {
  const verifyResult = verifyToken ? await consumeVerificationToken(verifyToken) : null;
  await loadSession();
  if (verifyResult) {
    showVerificationResult(verifyResult);
  } else if (oauthError) {
    showOAuthError(oauthError);
  }
}
