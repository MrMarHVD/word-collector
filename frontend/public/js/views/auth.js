import { elements } from "../dom.js";
import { state } from "../state.js";
import { t } from "../i18n.js";

// Toggle login/register controls without changing form ownership.
// Render the current auth mode and required confirmation field state.
export function renderAuthMode() {
  elements.authModeButtons.forEach((button) => {
    const active = button.dataset.authMode === state.authMode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  const isRegister = state.authMode === "register";
  elements.authConfirmWrap.hidden = !isRegister;
  elements.authConfirmPassword.required = isRegister;
  elements.authSubmit.textContent = t(isRegister ? "auth.register" : "auth.login");
  // The forgot-password link only makes sense when signing in.
  elements.authForgotButton.hidden = isRegister;
}

// Switch the visible auth sub-panel: "login", "forgot", or "reset".
export function showAuthPanel(panel) {
  elements.authLoginPanel.hidden = panel !== "login";
  elements.authForgotPanel.hidden = panel !== "forgot";
  elements.authResetPanel.hidden = panel !== "reset";
}

// Soft email-verification gate: a dismissible-looking reminder banner shown
// inside the app shell until the signed-in user verifies their address.
export function renderVerifyBanner() {
  const show = Boolean(state.user) && state.user.emailVerified !== true;
  elements.verifyBanner.hidden = !show;
  if (!show) {
    elements.verifyBannerStatus.textContent = "";
  }
}
