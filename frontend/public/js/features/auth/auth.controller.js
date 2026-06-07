import { requestJson } from "../../api.js";
import { availableStudyLanguages, setStudyLanguage } from "../../app/study-language.js";
import { elements } from "../../dom.js";
import { t } from "../../i18n.js";
import { state } from "../../state.js";
import { navigateToTab, resolveInitialTab } from "../../app/router.js";
import { renderAuthMode, renderVerifyBanner, showAuthPanel } from "../../views/auth.js";
import { showView } from "../../views/shell.js";

let loadDashboard = async () => {};
let renderSettings = () => {};

export function configureAuthController(options) {
  loadDashboard = options.loadDashboard;
  renderSettings = options.renderSettings;
}

export async function loadSession() {
  const result = await requestJson("/api/auth/me");
  state.user = result.user;
  state.languages = result.languages || [];
  state.predefinedLanguages = result.predefinedLanguages || [];
  state.studyLanguageOptions = result.studyLanguageOptions || [];
  state.nativeLanguageOptions = result.nativeLanguageOptions || [];
  if (!state.user) {
    showView("welcome");
    return;
  }
  const savedLanguageName = localStorage.getItem("wordMarkerStudyLanguageName") || "";
  const availableLanguages = availableStudyLanguages();
  const fallbackLanguageName = availableLanguages[0]?.name || "";
  state.selectedStudyLanguageName = availableLanguages.some((language) => language.name === savedLanguageName) ? savedLanguageName : fallbackLanguageName;
  showView("app");
  renderVerifyBanner();
  navigateToTab(resolveInitialTab(), { replace: true });
  renderSettings();
  await setStudyLanguage(state.selectedStudyLanguageName, { persist: true, reload: false });
  await loadDashboard();
}

function openAuthForm(mode) {
  state.authMode = mode;
  elements.authStatus.textContent = "";
  showAuthPanel("login");
  showView("auth");
  renderAuthMode();
}

// Open the auth view directly on the reset-password panel. Called from the
// bootstrap when the page is loaded from an emailed reset link.
export function openResetPassword(token) {
  state.resetToken = token;
  elements.resetStatus.textContent = "";
  elements.resetForm.reset();
  showAuthPanel("reset");
  showView("auth");
}

// Consume a verification token from an emailed link, returning a localized
// outcome to surface once the session view has settled.
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

// Surface a verification outcome. Call after loadSession so state.user reflects
// the freshly verified status. When signed in, the reminder banner is the
// primary signal (it vanishes on success); when signed out, land on login.
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
    } finally {
      state.user = null;
      state.csrfToken = null;
      state.dashboard = null;
      state.words = [];
      renderVerifyBanner();
      showView("welcome");
      elements.logoutButton.disabled = false;
    }
  });
}
