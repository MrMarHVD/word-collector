import { requestJson } from "../../api.js";
import { elements } from "../../dom.js";
import { t } from "../../i18n.js";
import { escapeHtml } from "../../shared/html.js";
import { state } from "../../state.js";

let reloadDashboard = async () => {};

export function configureSettingsController(options) {
  reloadDashboard = options.reloadDashboard;
}

export function renderSettings() {
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
}

export function bindSettingsEvents() {
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
      elements.settingsStatus.textContent = t("settings.saved");
      state.selectedMaterialId = null;
      state.currentMaterial = null;
      state.readerTokens = [];
      await reloadDashboard();
    } catch (error) {
      elements.settingsStatus.textContent = error.message;
    } finally {
      submitButton.disabled = false;
    }
  });
}
