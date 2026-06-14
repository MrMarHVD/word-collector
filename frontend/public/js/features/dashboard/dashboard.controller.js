import { requestJson } from "../../api.js";
import { elements } from "../../dom.js";
import { languageByName, renderStudyLanguageSelect } from "../../app/study-language.js";
import { cachedSelectedMaterialId, cacheSelectedMaterialId } from "../materials/materials.controller.js";
import { state } from "../../state.js";
import { renderDashboard, renderDashboardDocuments, renderDashboardStatsTabs } from "../../views/dashboard.js";
import { renderMaterialList, renderReaderSidebar, renderReaderSidebarTabs, renderReaderTokens } from "../../views/reader.js";

const DOCUMENT_STATS_PAGE_SIZE = 24;

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
  if (state.dashboardStatsTab === "documents") {
    await loadDashboardDocuments(true);
  }
  await loadMaterials(true);
  await restoreSelectedMaterial();
  await loadWords();
}

export function clearDashboardDependentViews() {
  renderMaterialList();
  renderReaderTokens();
}

export async function loadDashboardDocuments(reset = false) {
  if (!state.selectedStudyLanguageId || state.dashboardDocumentLoading) {
    return;
  }
  if (reset) {
    state.dashboardDocumentOffset = 0;
    state.dashboardDocumentHasMore = true;
    state.dashboardDocuments = [];
  }
  if (!state.dashboardDocumentHasMore) {
    renderDashboardDocuments();
    return;
  }

  state.dashboardDocumentLoading = true;
  try {
    const params = new URLSearchParams({
      languageId: String(state.selectedStudyLanguageId),
      limit: String(DOCUMENT_STATS_PAGE_SIZE),
      offset: String(state.dashboardDocumentOffset)
    });
    if (state.dashboardDocumentSearch.trim()) {
      params.set("search", state.dashboardDocumentSearch.trim());
    }
    const result = await requestJson(`/api/dashboard/documents?${params}`);
    state.dashboardDocuments = state.dashboardDocuments.concat(result.documents || []);
    state.dashboardDocumentOffset += (result.documents || []).length;
    state.dashboardDocumentHasMore = (result.documents || []).length === result.pageSize;
  } finally {
    state.dashboardDocumentLoading = false;
    renderDashboardDocuments();
  }
}

export function bindDashboardEvents() {
  elements.dashboardStatsTabs.forEach((button) => {
    button.addEventListener("click", async () => {
      state.dashboardStatsTab = button.dataset.dashboardStatsTab;
      renderDashboardStatsTabs();
      if (state.dashboardStatsTab === "documents" && !state.dashboardDocuments.length) {
        await loadDashboardDocuments(true);
      }
    });
  });

  let documentSearchDebounceId = null;
  elements.dashboardDocumentSearch.addEventListener("input", () => {
    state.dashboardDocumentSearch = elements.dashboardDocumentSearch.value;
    window.clearTimeout(documentSearchDebounceId);
    documentSearchDebounceId = window.setTimeout(() => {
      loadDashboardDocuments(true).catch(() => {});
    }, 200);
  });

  elements.dashboardDocumentsPane.addEventListener("scroll", async () => {
    const remainingScroll = elements.dashboardDocumentsPane.scrollHeight - elements.dashboardDocumentsPane.scrollTop - elements.dashboardDocumentsPane.clientHeight;
    if (remainingScroll < 140) {
      await loadDashboardDocuments(false);
    }
  });
}
