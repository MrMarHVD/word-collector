import { elements } from "../dom.js";
import { t } from "../i18n.js";
import { state } from "../state.js";
import { resetWordWindow } from "../views/shell.js";
import { renderReaderSidebarTabs } from "../views/reader.js";
import { escapeHtml } from "../shared/html.js";

let reloadDashboard = async () => {};

export function configureStudyLanguage(options) {
  reloadDashboard = options.reloadDashboard;
}

export function studyLanguageLabel(language) {
  return t(`studyLanguage.${language}`);
}

export function availableStudyLanguages() {
  return state.studyLanguageOptions
    .map((name) => state.languages.find((language) => language.name.toLowerCase() === name.toLowerCase()))
    .filter(Boolean);
}

export function renderStudyLanguageSelect() {
  if (!elements.studyLanguageSelect) {
    return;
  }
  elements.studyLanguageSelect.innerHTML = availableStudyLanguages()
    .map((language) => {
      const selected = language.id === state.selectedStudyLanguageId ? "selected" : "";
      return `<option value="${escapeHtml(language.name)}" ${selected}>${escapeHtml(studyLanguageLabel(language.name))}</option>`;
    })
    .join("");
}

export function languageByName(languages, name) {
  return languages.find((language) => language.name.toLowerCase() === name.toLowerCase());
}

export async function setStudyLanguage(languageName, { persist = true, reload = true } = {}) {
  if (!state.studyLanguageOptions.includes(languageName)) {
    return;
  }
  const language = languageByName(state.languages, languageName);
  if (!language) {
    return;
  }
  state.selectedStudyLanguageName = language.name;
  state.selectedStudyLanguageId = language.id;
  if (persist) {
    localStorage.setItem("wordMarkerStudyLanguageName", language.name);
  }
  renderStudyLanguageSelect();
  renderReaderSidebarTabs();
  if (reload) {
    state.selectedCollectionId = null;
    state.selectedMaterialId = null;
    state.currentMaterial = null;
    state.readerTokens = [];
    state.readerStart = 0;
    resetWordWindow();
    await reloadDashboard();
  }
}

export function bindStudyLanguageEvents() {
  elements.studyLanguageSelect.addEventListener("change", async (event) => {
    await setStudyLanguage(event.target.value);
  });

  window.addEventListener("storage", async (event) => {
    if (event.key !== "wordMarkerStudyLanguageName" || !event.newValue || !state.user) {
      return;
    }
    if (event.newValue === state.selectedStudyLanguageName) {
      return;
    }
    await setStudyLanguage(event.newValue, { persist: false });
  });
}
