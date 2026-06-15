/**
 * @fileoverview Application entry point for the Word Marker SPA.
 *
 * Orchestrates startup by:
 *   1. Wiring inter-feature dependencies via each feature controller's `configure*` call.
 *   2. Binding all global DOM event listeners (shell UI, mobile zoom guard, theme, locale).
 *   3. Loading the i18n message catalogue and applying the active locale.
 *   4. Starting the client-side router.
 *   5. Handling one-time deep-link tokens from email verification and password-reset
 *      flows (read from URL query parameters, then stripped from browser history).
 *
 * This module uses top-level `await` and must be loaded as `type="module"`.
 */

import { setUnauthorizedHandler } from "./api.js";
import { applyLocale, bindLocaleEvents, configureLocale } from "./app/locale.js";
import { navigateToTab, resolveInitialTab, startRouter } from "./app/router.js";
import { bindStudyLanguageEvents, configureStudyLanguage, renderStudyLanguageSelect } from "./app/study-language.js";
import { elements } from "./dom.js";
import { bindAuthEvents, configureAuthController, consumeVerificationToken, loadSession, openResetPassword, showOAuthError, showVerificationResult } from "./features/auth/auth.controller.js";
import { bindCollectionsEvents, configureCollectionsController, loadWords } from "./features/collections/collections.controller.js";
import { bindDashboardEvents, configureDashboardController, loadDashboard } from "./features/dashboard/dashboard.controller.js";
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

/**
 * Suppress pinch-zoom and multi-touch scroll gestures on mobile layouts
 * (viewport ≤ 760 px or coarse pointer) to prevent accidental page scaling.
 *
 * Attaches non-passive listeners for `gesturestart`, `gesturechange`,
 * `gestureend`, and multi-touch `touchmove` events on `document`.
 *
 * @returns {void}
 */
function bindMobileZoomGuard() {
  function isMobileLayout() {
    return window.matchMedia("(max-width: 760px), (pointer: coarse)").matches;
  }

  function preventMobileZoom(event) {
    if (isMobileLayout()) {
      event.preventDefault();
    }
  }

  document.addEventListener("gesturestart", preventMobileZoom, { passive: false });
  document.addEventListener("gesturechange", preventMobileZoom, { passive: false });
  document.addEventListener("gestureend", preventMobileZoom, { passive: false });
  document.addEventListener("touchmove", (event) => {
    if (event.touches.length > 1) {
      preventMobileZoom(event);
    }
  }, { passive: false });
}

/**
 * Attach event listeners for the application shell UI — tab navigation, the
 * brand/home button, the account settings dropdown, theme buttons, word display
 * mode buttons, and the click/keyboard/resize handlers that close the account
 * dropdown when focus moves away from it.
 *
 * @returns {void}
 */
function bindShellEvents() {
  function closeAccountDropdown() {
    elements.accountDropdown.hidden = accountMenuUsesDropdown();
    elements.settingsButton.setAttribute("aria-expanded", "false");
  }

  function accountMenuUsesDropdown() {
    return window.matchMedia("(max-width: 760px)").matches;
  }

  elements.tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      closeAccountDropdown();
      navigateToTab(button.dataset.tab);
    });
  });

  elements.brandHomeButton.addEventListener("click", () => {
    closeAccountDropdown();
    if (!state.selectedStudyLanguageId) {
      if (window.location.pathname !== "/") {
        window.history.pushState({}, "", "/");
      }
      showView("welcome");
      return;
    }
    navigateToTab("dashboard");
  });

  elements.settingsButton.addEventListener("click", () => {
    if (!accountMenuUsesDropdown()) {
      closeAccountDropdown();
      navigateToTab("settings");
      return;
    }
    const nextOpen = elements.accountDropdown.hidden;
    elements.accountDropdown.hidden = !nextOpen;
    elements.settingsButton.setAttribute("aria-expanded", String(nextOpen));
  });

  elements.accountSettingsButton.addEventListener("click", () => {
    closeAccountDropdown();
    navigateToTab("settings");
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

  document.addEventListener("click", (event) => {
    if (elements.accountDropdown.hidden || event.target.closest(".account-menu")) {
      return;
    }
    closeAccountDropdown();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeAccountDropdown();
    }
  });

  window.addEventListener("resize", closeAccountDropdown);
}

configureLocale({ renderSettings, renderStudyLanguageSelect });
configureStudyLanguage({ reloadDashboard: loadDashboard });
configureAuthController({ loadDashboard, renderSettings });
configureDashboardController({ loadMaterials, loadMaterialReader, loadWords });
configureMaterialsController({ loadDashboard, loadMaterialReader, loadWords });
configureReaderController({ loadDashboard });
configureCollectionsController({ loadDashboard });
configureImportsController({ loadDashboard });
configurePracticeController({ loadDashboard });
configureSettingsController({ reloadDashboard: loadDashboard });

setUnauthorizedHandler(() => showView("welcome"));
startRouter();
applyTheme();
bindMobileZoomGuard();
bindShellEvents();
bindLocaleEvents();
bindStudyLanguageEvents();
bindDashboardEvents();
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
