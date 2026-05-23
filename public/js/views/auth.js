import { elements } from "../dom.js";
import { state } from "../state.js";
import { t } from "../i18n.js";

// Toggle login/register controls without changing form ownership.
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
}
