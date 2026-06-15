/**
 * @fileoverview Dashboard feature controller — fetches and orchestrates the
 * dashboard data, coordinates initial state for the materials and word lists,
 * restores the previously selected material from cache, and manages the
 * documents stats tab with its paginated document list and search.
 */

import { requestJson } from "../../api.js";
import { elements } from "../../dom.js";
import { languageByName, renderStudyLanguageSelect } from "../../app/study-language.js";
import { cachedSelectedMaterialId, cacheSelectedMaterialId } from "../materials/materials.controller.js";
import { state } from "../../state.js";
import { renderDashboard, renderDashboardDocuments, renderDashboardStatsTabs } from "../../views/dashboard.js";
import { bindLocalTabs } from "../../views/components/local-tabs.js";
import { renderMaterialList, renderReaderSidebar, renderReaderSidebarTabs, renderReaderTokens } from "../../views/reader.js";

const DOCUMENT_STATS_PAGE_SIZE = 24;

let loadMaterials = async () => {};
let loadMaterialReader = async () => {};
let loadWords = async () => {};

/**
 * Injects dependencies that the dashboard controller needs but cannot import
 * directly (to avoid circular module dependencies).
 *
 * @param {{ loadMaterials: function(boolean=): Promise<void>, loadMaterialReader: function(number|null, object=): Promise<void>, loadWords: function(): Promise<void> }} options
 * @param {function(boolean=): Promise<void>} options.loadMaterials - Reloads
 *   the material list after a dashboard refresh.
 * @param {function(number|null, object=): Promise<void>} options.loadMaterialReader
 *   - Fetches reader tokens when restoring the previously selected material.
 * @param {function(): Promise<void>} options.loadWords - Reloads the
 *   vocabulary word list after a dashboard refresh.
 */
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

/**
 * Fetches summary metrics and collection data from `GET /api/dashboard` and
 * fully re-renders the dashboard, reader sidebar, and collections panel.
 *
 * After loading, also:
 * - Corrects the selected study language in state when the server returns an
 *   updated language list.
 * - Falls back `state.selectedCollectionId` to `"all"` when the previously
 *   selected collection no longer exists.
 * - Loads the documents stats page when the documents tab is currently active.
 * - Reloads the material list and attempts to restore the previously selected
 *   material from cache.
 * - Reloads the vocabulary word list.
 *
 * @returns {Promise<void>}
 *
 * @sideeffects
 * - Mutates `state.dashboard`, `state.predefinedLanguages`,
 *   `state.studyLanguageOptions`, `state.languages`,
 *   `state.selectedStudyLanguageName`, `state.selectedStudyLanguageId`, and
 *   `state.selectedCollectionId`.
 * - Calls GET `/api/dashboard?languageId=…`.
 * - Calls {@link renderDashboard}, {@link renderStudyLanguageSelect},
 *   {@link renderReaderSidebar}, {@link renderReaderSidebarTabs},
 *   `loadMaterials`, `loadWords`, and optionally
 *   {@link loadDashboardDocuments}.
 */
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

/**
 * Clears the material list and reader token panels without refetching data.
 * Used during study-language switches to wipe stale content before the new
 * language's data has loaded.
 *
 * @sideeffects
 * - Calls {@link renderMaterialList} and {@link renderReaderTokens}.
 */
export function clearDashboardDependentViews() {
  renderMaterialList();
  renderReaderTokens();
}

/**
 * Fetches a page of per-document progress data for the documents stats tab.
 * Skips when no study language is active or a request is already in flight.
 *
 * When `reset` is `true` the offset is cleared and the existing document list
 * is discarded before fetching from the beginning. Subsequent calls with
 * `reset = false` append the next page.
 *
 * @param {boolean} [reset=false] - When `true`, discards the current document
 *   list and fetches from offset 0.
 *
 * @returns {Promise<void>}
 *
 * @sideeffects
 * - Mutates `state.dashboardDocuments`, `state.dashboardDocumentOffset`,
 *   `state.dashboardDocumentHasMore`, and `state.dashboardDocumentLoading`.
 * - Calls GET `/api/dashboard/documents?languageId=…&limit=…&offset=…&search=…`.
 * - Calls {@link renderDashboardDocuments}.
 */
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

/**
 * Attaches all DOM event listeners for the dashboard feature. Must be called
 * once during application bootstrap.
 *
 * Registered interactions include:
 * - Dashboard stats tab switching (overview / documents) via
 *   {@link bindLocalTabs}. Triggers a document load on first switch to the
 *   documents tab.
 * - Document search input with 200 ms debounce triggering a reset load.
 * - Documents pane scroll triggering paginated load when near the bottom
 *   (remaining scroll ≤ 140 px).
 *
 * @sideeffects
 * - Adds event listeners on `elements.dashboardStatsTabs`,
 *   `elements.dashboardDocumentSearch`, and `elements.dashboardDocumentsPane`.
 * - Writes `state.dashboardStatsTab` and `"wordMarkerDashboardStatsTab"` to
 *   localStorage on tab change.
 */
export function bindDashboardEvents() {
  bindLocalTabs(elements.dashboardStatsTabs, async (tab) => {
    state.dashboardStatsTab = tab === "documents" ? "documents" : "overview";
    localStorage.setItem("wordMarkerDashboardStatsTab", state.dashboardStatsTab);
    renderDashboardStatsTabs();
    if (state.dashboardStatsTab === "documents" && !state.dashboardDocuments.length) {
      await loadDashboardDocuments(true);
    }
  }, {
    valueAttribute: "data-dashboard-stats-tab"
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
