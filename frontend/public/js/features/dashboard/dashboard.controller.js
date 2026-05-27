import { requestJson } from "../../api.js";
import { languageByName, renderStudyLanguageSelect } from "../../app/study-language.js";
import { state } from "../../state.js";
import { renderDashboard } from "../../views/dashboard.js";
import { renderMaterialList, renderReaderSidebar, renderReaderSidebarTabs, renderReaderTokens } from "../../views/reader.js";

let loadMaterials = async () => {};
let loadWords = async () => {};

export function configureDashboardController(options) {
  loadMaterials = options.loadMaterials;
  loadWords = options.loadWords;
}

export async function loadDashboard() {
  const params = new URLSearchParams();
  if (state.selectedStudyLanguageId) {
    params.set("languageId", state.selectedStudyLanguageId);
  }
  state.dashboard = await requestJson(`/api/dashboard?${params}`);

  state.predefinedLanguages = state.dashboard.predefinedLanguages || state.predefinedLanguages;
  state.studyLanguageOptions = state.dashboard.studyLanguageOptions || state.studyLanguageOptions;
  state.languages = state.dashboard.languages || state.languages;
  const selectedLanguage = languageByName(state.languages, state.selectedStudyLanguageName) || state.languages.find((language) => language.id === state.selectedStudyLanguageId);
  if (selectedLanguage) {
    state.selectedStudyLanguageName = selectedLanguage.name;
    state.selectedStudyLanguageId = selectedLanguage.id;
  }
  const allCollections = state.dashboard.collections;
  if (!state.selectedCollectionId) {
    state.selectedCollectionId = "all";
  }
  if (state.selectedCollectionId !== "all" && !allCollections.some((collection) => collection.id === state.selectedCollectionId)) {
    state.selectedCollectionId = "all";
  }
  renderDashboard();
  renderStudyLanguageSelect();
  renderReaderSidebar();
  renderReaderSidebarTabs();
  await loadMaterials(true);
  await loadWords();
}

export function clearDashboardDependentViews() {
  renderMaterialList();
  renderReaderTokens();
}
