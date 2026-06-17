/**
 * @fileoverview Auth feature controller — handles the full authentication
 * lifecycle: session bootstrap, login/register form submission, Google OAuth
 * redirect, forgot/reset password flows, email-verification token consumption
 * and banner display, verification email resend, and logout. Also manages the
 * initial tab and view routing after a session is established.
 */

import { apiUrl, requestJson } from "../../api.js";
import { availableStudyLanguages, setStudyLanguage } from "../../app/study-language.js";
import { elements } from "../../dom.js";
import { t } from "../../i18n.js";
import { state } from "../../state.js";
import { navigateToTab, resolveInitialTab, tabForPath } from "../../app/router.js";
import { renderAuthMode, renderVerifyBanner, showAuthPanel } from "../../views/auth.js";
import { showView } from "../../views/shell.js";

let loadDashboard = async () => {};
let renderSettings = () => {};

/**
 * Injects dependencies that the auth controller needs but cannot import
 * directly (to avoid circular module dependencies).
 *
 * @param {{ loadDashboard: function(): Promise<void>, renderSettings: function(): void }} options
 * @param {function(): Promise<void>} options.loadDashboard - Loads dashboard
 *   data after a successful login.
 * @param {function(): void} options.renderSettings - Renders the settings panel
 *   after the session is established.
 */
export function configureAuthController(options) {
  loadDashboard = options.loadDashboard;
  renderSettings = options.renderSettings;
}

/**
 * Bootstraps the application by fetching the current session from
 * `GET /api/auth/me`. Populates `state.user`, language options, and available
 * auth providers.
 *
 * When no session is active, shows the welcome view. When a session is active,
 * resolves the study language (from localStorage or first available), triggers
 * an initial dashboard load, and navigates to the initial tab (respecting the
 * current URL path).
 *
 * When the user is logged in but has no study language configured, routes to
 * the welcome view (or the settings tab if the URL path implies it).
 *
 * @returns {Promise<void>}
 *
 * @sideeffects
 * - Mutates `state.user`, `state.languages`, `state.predefinedLanguages`,
 *   `state.studyLanguageOptions`, `state.nativeLanguageOptions`,
 *   `state.authProviders`, and `state.selectedStudyLanguageName`.
 * - Calls GET `/api/auth/me`.
 * - Calls {@link renderVerifyBanner}, {@link renderSettings},
 *   {@link setStudyLanguage}, {@link showView}, {@link navigateToTab}, and
 *   `loadDashboard`.
 */
export async function loadSession() {
  const result = await requestJson("/api/auth/me");
  state.user = result.user;
  state.languages = result.languages || [];
  state.predefinedLanguages = result.predefinedLanguages || [];
  state.studyLanguageOptions = result.studyLanguageOptions || [];
  state.nativeLanguageOptions = result.nativeLanguageOptions || [];
  state.authProviders = result.authProviders || {};
  if (!state.user) {
    showView("welcome");
    return;
  }
  const savedLanguageName = localStorage.getItem("wordMarkerStudyLanguageName") || "";
  const availableLanguages = availableStudyLanguages();
  const fallbackLanguageName = availableLanguages[0]?.name || "";
  state.selectedStudyLanguageName = availableLanguages.some((language) => language.name === savedLanguageName) ? savedLanguageName : fallbackLanguageName;
  renderVerifyBanner();
  renderSettings();
  await setStudyLanguage(state.selectedStudyLanguageName, { persist: true, reload: false });
  if (!state.selectedStudyLanguageId) {
    if (tabForPath(window.location.pathname) === "settings") {
      showView("app");
      navigateToTab("settings", { replace: true });
      return;
    }
    showView("welcome");
    return;
  }
  showView("app");
  navigateToTab(resolveInitialTab(), { replace: true });
  await loadDashboard();
}

function openAuthForm(mode) {
  state.authMode = mode;
  elements.authStatus.textContent = "";
  showAuthPanel("login");
  showView("auth");
  renderAuthMode();
}

/**
 * Surfaces a Google OAuth error on the login panel. Called during bootstrap
 * when the page URL contains an OAuth error query parameter from the server-
 * side callback.
 *
 * Accepts keys with or without the `"errors."` prefix and falls back to a
 * generic "googleOAuthFailed" message for unrecognised keys.
 *
 * @param {string|undefined} errorKey - A localisation key, optionally
 *   prefixed with `"errors."`.
 *
 * @sideeffects
 * - Sets `state.authMode` to `"login"`.
 * - Updates `elements.authStatus.textContent` with the localised error.
 * - Calls {@link showAuthPanel} and {@link showView} to display the login form.
 * - Calls {@link renderAuthMode}.
 */
export function showOAuthError(errorKey) {
  const key = errorKey?.startsWith("errors.") ? errorKey : `errors.${errorKey || "googleOAuthFailed"}`;
  state.authMode = "login";
  elements.authStatus.textContent = t(key, {}, t("errors.googleOAuthFailed"));
  showAuthPanel("login");
  showView("auth");
  renderAuthMode();
}

/**
 * Opens the auth view directly on the reset-password panel. Called from the
 * application bootstrap when the page URL contains a password-reset token
 * from an emailed link.
 *
 * @param {string} token - The one-time reset token from the URL.
 *
 * @sideeffects
 * - Stores `token` in `state.resetToken`.
 * - Resets `elements.resetForm` and clears `elements.resetStatus`.
 * - Calls {@link showAuthPanel} (`"reset"`) and {@link showView} (`"auth"`).
 */
export function openResetPassword(token) {
  state.resetToken = token;
  elements.resetStatus.textContent = "";
  elements.resetForm.reset();
  showAuthPanel("reset");
  showView("auth");
}

/**
 * Submits an email-verification token to `POST /api/auth/verify-email` and
 * returns a localised outcome object. Should be called during bootstrap when
 * the page URL contains a verification token; the caller then passes the result
 * to {@link showVerificationResult} after the session has been loaded.
 *
 * @param {string} token - The verification token from the URL.
 * @returns {Promise<{ ok: boolean, message: string }>} `ok` is `true` on
 *   success; `message` is a localised string for display.
 */
export async function consumeVerificationToken(token) {
  try {
    await requestJson("/api/auth/verify-email", {
      method: "POST",
      handleUnauthorized: false,
      body: JSON.stringify({ token })
    });
    return { ok: true, message: t("verify.success") };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

/**
 * Surfaces the outcome of an email-verification attempt. Must be called after
 * {@link loadSession} so `state.user` reflects the freshly-verified status.
 *
 * - **Signed in**: updates the verification banner. On success the banner
 *   disappears (the user is now verified); on failure the banner remains and
 *   shows the error message.
 * - **Signed out**: navigates to the auth view login panel and shows the
 *   outcome message in the auth status area.
 *
 * @param {{ ok: boolean, message: string }} result - Outcome from
 *   {@link consumeVerificationToken}.
 *
 * @sideeffects
 * - When signed in: calls {@link renderVerifyBanner}, may set
 *   `elements.verifyBannerStatus.textContent`.
 * - When signed out: sets `state.authMode`, calls {@link showAuthPanel},
 *   {@link showView}, {@link renderAuthMode}, and sets
 *   `elements.authStatus.textContent`.
 */
export function showVerificationResult(result) {
  if (state.user) {
    renderVerifyBanner();
    if (!elements.verifyBanner.hidden) {
      elements.verifyBannerStatus.textContent = result.message;
    }
    return;
  }
  state.authMode = "login";
  showAuthPanel("login");
  showView("auth");
  renderAuthMode();
  elements.authStatus.textContent = result.message;
}

/**
 * Attaches all DOM event listeners for the auth feature. Must be called once
 * during application bootstrap.
 *
 * Registered interactions include:
 * - Login / register buttons on the menu bar and welcome screen opening the
 *   auth view in the appropriate mode.
 * - Back button returning to the welcome view.
 * - Auth-mode toggle buttons (login / register) updating `state.authMode`.
 * - Auth form submission: POSTs to `/api/auth/login` or `/api/auth/register`;
 *   calls {@link loadSession} on success.
 * - Forgot-password link navigating to the forgot panel.
 * - Google OAuth button redirecting to `/api/auth/google/start`.
 * - Forgot-password back button returning to the login panel.
 * - Forgot-password form submission: POSTs to
 *   `/api/auth/request-password-reset`; always shows a generic success
 *   message to avoid account-enumeration.
 * - Reset-password form submission: POSTs to `/api/auth/reset-password`;
 *   on success returns to the login panel with a confirmation message.
 * - Verify-email resend button: POSTs to `/api/auth/resend-verification`.
 * - Logout button: POSTs to `/api/auth/logout`; clears user state and shows
 *   the welcome view.
 *
 * @sideeffects
 * - Adds event listeners on `elements.loginButton`,
 *   `elements.welcomeLoginButton`, `elements.welcomeRegisterButton`,
 *   `elements.authBackButton`, `elements.authModeButtons`,
 *   `elements.authForm`, `elements.authForgotButton`,
 *   `elements.authGoogleButton`, `elements.authForgotBackButton`,
 *   `elements.forgotForm`, `elements.resetForm`,
 *   `elements.verifyResendButton`, and `elements.logoutButton`.
 */
export function bindAuthEvents() {
  elements.loginButton.addEventListener("click", () => openAuthForm("login"));
  elements.welcomeLoginButton.addEventListener("click", () => openAuthForm("login"));
  elements.welcomeRegisterButton.addEventListener("click", () => openAuthForm("register"));
  elements.authBackButton.addEventListener("click", () => showView("welcome"));

  elements.authModeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.authMode = button.dataset.authMode;
      elements.authStatus.textContent = "";
      renderAuthMode();
    });
  });

  elements.authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const isRegister = state.authMode === "register";
    elements.authSubmit.disabled = true;
    elements.authStatus.textContent = t(isRegister ? "auth.registering" : "auth.loggingIn");
    try {
      await requestJson(isRegister ? "/api/auth/register" : "/api/auth/login", {
        method: "POST",
        handleUnauthorized: false,
        body: JSON.stringify({
          email: elements.authEmail.value,
          password: elements.authPassword.value,
          confirmPassword: elements.authConfirmPassword.value
        })
      });
      elements.authForm.reset();
      await loadSession();
    } catch (error) {
      elements.authStatus.textContent = error.message;
    } finally {
      elements.authSubmit.disabled = false;
    }
  });

  elements.authForgotButton.addEventListener("click", () => {
    elements.forgotStatus.textContent = "";
    elements.forgotForm.reset();
    showAuthPanel("forgot");
  });

  elements.authGoogleButton.addEventListener("click", () => {
    window.location.href = apiUrl("/api/auth/google/start");
  });

  elements.authForgotBackButton.addEventListener("click", () => {
    elements.authStatus.textContent = "";
    showAuthPanel("login");
  });

  elements.forgotForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    elements.forgotSubmit.disabled = true;
    elements.forgotStatus.textContent = t("auth.sendingResetLink");
    try {
      await requestJson("/api/auth/request-password-reset", {
        method: "POST",
        handleUnauthorized: false,
        body: JSON.stringify({ email: elements.forgotEmail.value })
      });
      // Always report success to avoid revealing whether the account exists.
      elements.forgotStatus.textContent = t("auth.resetLinkSent");
      elements.forgotForm.reset();
    } catch (error) {
      elements.forgotStatus.textContent = error.message;
    } finally {
      elements.forgotSubmit.disabled = false;
    }
  });

  elements.resetForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    elements.resetSubmit.disabled = true;
    elements.resetStatus.textContent = t("auth.updatingPassword");
    try {
      await requestJson("/api/auth/reset-password", {
        method: "POST",
        handleUnauthorized: false,
        body: JSON.stringify({
          token: state.resetToken,
          password: elements.resetPassword.value,
          confirmPassword: elements.resetConfirmPassword.value
        })
      });
      state.resetToken = null;
      elements.resetForm.reset();
      elements.authStatus.textContent = t("auth.passwordUpdated");
      state.authMode = "login";
      showAuthPanel("login");
      renderAuthMode();
    } catch (error) {
      elements.resetStatus.textContent = error.message;
    } finally {
      elements.resetSubmit.disabled = false;
    }
  });

  elements.verifyResendButton.addEventListener("click", async () => {
    elements.verifyResendButton.disabled = true;
    elements.verifyBannerStatus.textContent = t("verify.sending");
    try {
      await requestJson("/api/auth/resend-verification", { method: "POST" });
      elements.verifyBannerStatus.textContent = t("verify.sent");
    } catch (error) {
      elements.verifyBannerStatus.textContent = error.message;
    } finally {
      elements.verifyResendButton.disabled = false;
    }
  });

  elements.logoutButton.addEventListener("click", async () => {
    elements.logoutButton.disabled = true;
    try {
      await requestJson("/api/auth/logout", { method: "POST" });
      state.user = null;
      state.csrfToken = null;
      state.dashboard = null;
      state.words = [];
      renderVerifyBanner();
      showView("welcome");
    } catch (error) {
      elements.verifyBannerStatus.textContent = error.message;
    } finally {
      elements.logoutButton.disabled = false;
    }
  });
}
