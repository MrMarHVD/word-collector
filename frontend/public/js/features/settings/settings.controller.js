import { requestJson } from "../../api.js";
import { availableStudyLanguages, firstAvailableStudyLanguageAlphabetically, setStudyLanguage, studyLanguageLabel } from "../../app/study-language.js";
import { elements } from "../../dom.js";
import { t } from "../../i18n.js";
import { escapeHtml } from "../../shared/html.js";
import { state } from "../../state.js";

let reloadDashboard = async () => {};

export function configureSettingsController(options) {
  reloadDashboard = options.reloadDashboard;
}

export function renderSettingsTabs() {
  elements.settingsMenuButtons.forEach((button) => {
    const active = button.dataset.settingsTab === state.settingsTab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-current", active ? "page" : "false");
  });
  elements.settingsPanels.forEach((panel) => {
    panel.hidden = panel.dataset.settingsPanel !== state.settingsTab;
  });
}

export function renderSettings() {
  renderSettingsTabs();
  if (!elements.nativeLanguageSelect) {
    return;
  }
  elements.nativeLanguageSelect.innerHTML = state.nativeLanguageOptions
    .map((language) => {
      const selected = language === state.user?.nativeLanguage ? "selected" : "";
      return `<option value="${escapeHtml(language)}" ${selected}>${escapeHtml(t(`settings.nativeLanguage.${language}`))}</option>`;
    })
    .join("");
  if (elements.practiceWordsPerSession) {
    elements.practiceWordsPerSession.value = String(Number(state.user?.practiceWordsPerSession) || 20);
  }
  elements.changePasswordForm.hidden = state.user?.hasPassword !== true;
  if (state.user?.hasPassword !== true) {
    elements.changePasswordStatus.textContent = t("settings.passwordUnavailable");
  } else if (elements.changePasswordStatus.textContent === t("settings.passwordUnavailable")) {
    elements.changePasswordStatus.textContent = "";
  }
}

export function bindSettingsEvents() {
  elements.settingsMenu.addEventListener("click", (event) => {
    const button = event.target.closest("[data-settings-tab]");
    if (!button) {
      return;
    }
    state.settingsTab = button.dataset.settingsTab;
    renderSettingsTabs();
  });

  elements.changePasswordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    elements.changePasswordStatus.textContent = t("settings.updatingPassword");
    const submitButton = elements.changePasswordForm.querySelector("button");
    submitButton.disabled = true;
    try {
      await requestJson("/api/settings/password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: elements.currentPassword.value,
          newPassword: elements.newPassword.value,
          confirmPassword: elements.confirmNewPassword.value
        })
      });
      elements.changePasswordForm.reset();
      elements.changePasswordStatus.textContent = t("settings.passwordUpdated");
    } catch (error) {
      elements.changePasswordStatus.textContent = error.message;
    } finally {
      submitButton.disabled = false;
    }
  });

  elements.settingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    elements.settingsStatus.textContent = t("settings.saving");
    const submitButton = elements.settingsForm.querySelector("button");
    submitButton.disabled = true;
    try {
      const result = await requestJson("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({
          nativeLanguage: elements.nativeLanguageSelect.value,
          activeStudyLanguage: state.selectedStudyLanguageName,
          practiceWordsPerSession: elements.practiceWordsPerSession.value
        })
      });
      state.user = result.user;
      state.nativeLanguageOptions = result.nativeLanguageOptions || state.nativeLanguageOptions;
      renderSettings();
      state.selectedMaterialId = null;
      state.currentMaterial = null;
      state.readerTokens = [];
      if (!availableStudyLanguages().some((language) => language.name === state.selectedStudyLanguageName)) {
        const replacement = firstAvailableStudyLanguageAlphabetically();
        await setStudyLanguage(replacement?.name || "", { persist: true, reload: false });
        elements.settingsStatus.textContent = replacement
          ? t("settings.savedStudyLanguageChanged", { language: studyLanguageLabel(replacement.name) })
          : t("settings.savedNoStudyLanguage");
      } else {
        elements.settingsStatus.textContent = t("settings.saved");
      }
      await reloadDashboard();
    } catch (error) {
      elements.settingsStatus.textContent = error.message;
    } finally {
      submitButton.disabled = false;
    }
  });
}
