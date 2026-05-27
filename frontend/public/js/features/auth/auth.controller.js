import { requestJson } from "../../api.js";
import { availableStudyLanguages, setStudyLanguage } from "../../app/study-language.js";
import { elements } from "../../dom.js";
import { t } from "../../i18n.js";
import { state } from "../../state.js";
import { renderAuthMode } from "../../views/auth.js";
import { showView } from "../../views/shell.js";

let activateTab = () => {};
let loadDashboard = async () => {};
let renderSettings = () => {};

export function configureAuthController(options) {
  activateTab = options.activateTab;
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
    showView("auth");
    renderAuthMode();
    return;
  }
  const savedLanguageName = localStorage.getItem("wordMarkerStudyLanguageName") || "";
  const availableLanguages = availableStudyLanguages();
  const fallbackLanguageName = availableLanguages[0]?.name || "";
  state.selectedStudyLanguageName = availableLanguages.some((language) => language.name === savedLanguageName) ? savedLanguageName : fallbackLanguageName;
  showView("app");
  activateTab(state.activeTab);
  renderSettings();
  await setStudyLanguage(state.selectedStudyLanguageName, { persist: true, reload: false });
  await loadDashboard();
}

export function bindAuthEvents() {
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

  elements.logoutButton.addEventListener("click", async () => {
    elements.logoutButton.disabled = true;
    try {
      await requestJson("/api/auth/logout", { method: "POST" });
    } finally {
      state.user = null;
      state.dashboard = null;
      state.words = [];
      showView("auth");
      elements.logoutButton.disabled = false;
    }
  });
}
