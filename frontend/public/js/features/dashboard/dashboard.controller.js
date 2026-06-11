import { requestJson } from "../../api.js";
import { languageByName, renderStudyLanguageSelect } from "../../app/study-language.js";
import { cachedSelectedMaterialId, cacheSelectedMaterialId } from "../materials/materials.controller.js";
import { state } from "../../state.js";
import { renderDashboard } from "../../views/dashboard.js";
import { renderMaterialList, renderReaderSidebar, renderReaderSidebarTabs, renderReaderTokens } from "../../views/reader.js";

let loadMaterials = async () => {};
let loadMaterialReader = async () => {};
let loadWords = async () => {};

export function configureDashboardController(options) {
  loadMaterials = options.loadMaterials;
  loadMaterialReader = options.loadMaterialReader;
  loadWords = options.loadWords;
}

async function restoreSelectedMaterial() {
  if (state.selectedMaterialId || !state.selectedStudyLanguageId) {
    return;
  }
  const materialId = cachedSelectedMaterialId();
  if (!materialId) {
    return;
  }
  state.selectedMaterialId = materialId;
  state.readerSidebarTab = "read";
  try {
    await loadMaterialReader(null, { persist: false });
    renderMaterialList();
  } catch (error) {
    state.selectedMaterialId = null;
    state.currentMaterial = null;
    state.readerTokens = [];
    state.readerFetchedTokens = [];
    state.readerStart = 0;
    cacheSelectedMaterialId(null);
    renderMaterialList();
    renderReaderTokens();
  }
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
  await restoreSelectedMaterial();
  await loadWords();
}

export function clearDashboardDependentViews() {
  renderMaterialList();
  renderReaderTokens();
}
