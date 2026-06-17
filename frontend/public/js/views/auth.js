/**
 * @fileoverview Auth view — controls visibility and state of the authentication
 * screen (login / register forms, forgot-password, reset-password panels) and
 * the email-verification reminder banner shown inside the main app shell.
 */

import { elements } from "../dom.js";
import { state } from "../state.js";
import { t } from "../i18n.js";

/**
 * Synchronises the auth form with `state.authMode` (`"login"` or
 * `"register"`). Toggles mode-selector button states, shows or hides the
 * confirm-password field, the password requirements hint, the Google OAuth
 * button, the divider, and the forgot-password link. Updates the submit
 * button label.
 *
 * @sideeffects
 * - Toggles `is-active` and `aria-pressed` on each `elements.authModeButtons`
 *   entry.
 * - Shows or hides `elements.authConfirmWrap`, `elements.authPasswordRequirements`,
 *   `elements.authGoogleButton`, `elements.authDivider`, and
 *   `elements.authForgotButton`.
 * - Sets `elements.authConfirmPassword.required`.
 * - Updates `elements.authSubmit.textContent`.
 */
export function renderAuthMode() {
  elements.authModeButtons.forEach((button) => {
    const active = button.dataset.authMode === state.authMode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  const isRegister = state.authMode === "register";
  elements.authConfirmWrap.hidden = !isRegister;
  elements.authConfirmPassword.required = isRegister;
  elements.authPasswordRequirements.hidden = !isRegister;
  elements.authSubmit.textContent = t(isRegister ? "auth.register" : "auth.login");
  const googleEnabled = state.authProviders?.google === true;
  elements.authGoogleButton.hidden = !googleEnabled;
  elements.authDivider.hidden = !googleEnabled;
  // The forgot-password link only makes sense when signing in.
  elements.authForgotButton.hidden = isRegister;
}

/**
 * Switches the visible sub-panel inside the auth view. Exactly one panel is
 * shown at a time.
 *
 * @param {"login"|"forgot"|"reset"} panel - The sub-panel to make visible.
 *
 * @sideeffects
 * - Sets `hidden` on `elements.authLoginPanel`, `elements.authForgotPanel`,
 *   and `elements.authResetPanel` so only the nominated panel is visible.
 */
export function showAuthPanel(panel) {
  elements.authLoginPanel.hidden = panel !== "login";
  elements.authForgotPanel.hidden = panel !== "forgot";
  elements.authResetPanel.hidden = panel !== "reset";
}

/**
 * Shows or hides the email-verification reminder banner based on the current
 * user's verification status. The banner persists inside the app shell until
 * the user verifies their email address or signs out.
 *
 * When hidden, the banner's status message is also cleared so it does not
 * resurface stale text if the banner is shown again later.
 *
 * @sideeffects
 * - Sets `elements.verifyBanner.hidden`.
 * - Clears `elements.verifyBannerStatus.textContent` when hiding.
 */
export function renderVerifyBanner() {
  const show = Boolean(state.user) && state.user.emailVerified !== true;
  elements.verifyBanner.hidden = !show;
  if (!show) {
    elements.verifyBannerStatus.textContent = "";
  }
}
