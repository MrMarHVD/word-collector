/**
 * @fileoverview Materials feature controller — manages the list of imported
 * reading materials for the current study language. Handles paginated loading
 * with infinite scroll, file upload via the import modal, material selection,
 * inline renaming, deletion, and translation-progress polling. Also maintains
 * a per-study-language localStorage cache of the last selected material ID so
 * the reader can restore its position on next load.
 */

import { apiErrorMessage, apiUrl, csrfHeaders, requestJson } from "../../api.js";
import { elements } from "../../dom.js";
import { t } from "../../i18n.js";
import { BETA_MAX_MATERIALS_PER_USER, BETA_MAX_MATERIAL_UPLOAD_BYTES, state } from "../../state.js";
import { renderImportProgress, renderMaterialList, renderReaderSidebarTabs, renderReaderTokens } from "../../views/reader.js";

let loadDashboard = async () => {};
let loadMaterialReader = async () => {};
let loadWords = async () => {};
let translationPollId = null;

function selectedMaterialCacheKey() {
  return state.selectedStudyLanguageId ? `wordMarkerSelectedMaterialId:${state.selectedStudyLanguageId}` : "";
}

/**
 * Returns the persisted selected material ID for the current study language
 * from localStorage, or `null` when none is stored or no study language is
 * active.
 *
 * @returns {number|null}
 */
export function cachedSelectedMaterialId() {
  const key = selectedMaterialCacheKey();
  return key ? Number(localStorage.getItem(key)) || null : null;
}

/**
 * Writes or removes the selected material ID in localStorage under a key that
 * is scoped to the current study language. Does nothing when no study language
 * is active.
 *
 * @param {number|null} materialId - The material ID to persist, or `null` to
 *   remove the cached entry.
 */
export function cacheSelectedMaterialId(materialId) {
  const key = selectedMaterialCacheKey();
  if (!key) {
    return;
  }
  if (materialId) {
    localStorage.setItem(key, String(materialId));
  } else {
    localStorage.removeItem(key);
  }
}

/**
 * Injects dependencies that the materials controller needs but cannot import
 * directly (to avoid circular module dependencies).
 *
 * @param {{ loadDashboard: function(): Promise<void>, loadMaterialReader: function(number|null, object=): Promise<void>, loadWords: function(): Promise<void> }} options
 * @param {function(): Promise<void>} options.loadDashboard - Reloads dashboard
 *   data after a material is uploaded or deleted.
 * @param {function(number|null, object=): Promise<void>} options.loadMaterialReader
 *   - Fetches and renders reader tokens for the selected material.
 * @param {function(): Promise<void>} options.loadWords - Reloads the vocabulary
 *   word list, called during translation-progress polling.
 */
export function configureMaterialsController(options) {
  loadDashboard = options.loadDashboard;
  loadMaterialReader = options.loadMaterialReader;
  loadWords = options.loadWords;
}

function hasPendingWork() {
  return state.materials.some((material) =>
    material.importStatus === "processing"
    || (material.translationStatus && !material.translationStatus.ready));
}

// When the work being imported becomes openable, select and open it so the
// reader appears as soon as the progress bar completes.
async function openImportedMaterialWhenReady() {
  const tracked = state.importingMaterialId
    ? state.materials.find((material) => material.id === state.importingMaterialId)
    : null;
  if (!tracked || tracked.importStatus !== "ready" || (tracked.translationStatus && !tracked.translationStatus.ready)) {
    return;
  }
  state.importingMaterialId = null;
  state.selectedMaterialId = tracked.id;
  cacheSelectedMaterialId(tracked.id);
  state.readerStart = Number(tracked.readerStart) || 0;
  renderMaterialList();
  await loadMaterialReader(state.readerStart, { persist: false });
}

function scheduleTranslationRefresh() {
  if (translationPollId || !hasPendingWork()) {
    return;
  }
  translationPollId = window.setInterval(async () => {
    try {
      if (!hasPendingWork()) {
        window.clearInterval(translationPollId);
        translationPollId = null;
        return;
      }
      await loadMaterials(true);
      await loadWords();
      await openImportedMaterialWhenReady();
      if (state.selectedMaterialId && state.currentMaterial?.translationStatus && !state.currentMaterial.translationStatus.ready) {
        await loadMaterialReader(state.readerStart, { persist: false });
      }
    } catch (error) {
      console.error(error);
    }
  }, 1500);
}

function openMaterialImportModal() {
  elements.materialImportModal.hidden = false;
  elements.materialImportModal.classList.remove("hidden");
  elements.materialImportModal.classList.add("flex");
  elements.materialFile.focus();
}

function closeMaterialImportModal() {
  elements.materialImportModal.hidden = true;
  elements.materialImportModal.classList.add("hidden");
  elements.materialImportModal.classList.remove("flex");
}

function focusMaterialRenameInput() {
  requestAnimationFrame(() => {
    const input = elements.materialList.querySelector(".material-title-input");
    input?.focus();
    input?.select();
  });
}

async function saveMaterialRename(materialId, title) {
  const material = state.materials.find((entry) => entry.id === materialId);
  if (!material) {
    return;
  }
  const nextTitle = title.trim();
  if (!nextTitle) {
    elements.materialImportStatus.textContent = t("reader.renameMaterialRequired");
    focusMaterialRenameInput();
    return;
  }
  if (nextTitle === material.title) {
    state.materialRenameId = null;
    renderMaterialList();
    return;
  }
  const result = await requestJson(`/api/materials/${materialId}`, {
    method: "PATCH",
    body: JSON.stringify({ title: nextTitle })
  });
  state.materials = state.materials.map((entry) => (entry.id === materialId ? { ...entry, title: result.material.title } : entry));
  if (state.currentMaterial?.id === materialId) {
    state.currentMaterial = { ...state.currentMaterial, title: result.material.title };
  }
  state.materialRenameId = null;
  elements.materialImportStatus.textContent = t("reader.renamedMaterial");
  renderMaterialList();
  renderReaderTokens();
}

/**
 * Fetches the material list for the current study language and appends it to
 * `state.materials`. Clears state and renders empty views when no study
 * language is active.
 *
 * Supports pagination: when `reset` is `true` the offset is reset and the
 * existing list is cleared before fetching page 1. Subsequent calls with
 * `reset = false` append the next page. Stops early when `state.materialHasMore`
 * is `false`.
 *
 * After loading, schedules a translation-refresh polling interval when any
 * material is still being imported or translated.
 *
 * @param {boolean} [reset=false] - When `true`, discards the current list and
 *   fetches from offset 0.
 *
 * @returns {Promise<void>}
 *
 * @sideeffects
 * - Mutates `state.materials`, `state.materialOffset`, `state.materialHasMore`,
 *   and `state.selectedMaterialId`.
 * - Calls GET `/api/materials?languageId=…&offset=…&search=…`.
 * - Calls {@link renderMaterialList}, {@link renderImportProgress}, and
 *   {@link renderReaderTokens}.
 * - Starts or clears the translation-refresh polling interval.
 */
export async function loadMaterials(reset = false) {
  if (!state.selectedStudyLanguageId) {
    if (translationPollId) {
      window.clearInterval(translationPollId);
      translationPollId = null;
    }
    state.materials = [];
    state.selectedMaterialId = null;
    cacheSelectedMaterialId(null);
    renderMaterialList();
    renderImportProgress();
    renderReaderTokens();
    return;
  }
  if (reset) {
    state.materialOffset = 0;
    state.materialHasMore = true;
    state.materials = [];
  }
  if (!state.materialHasMore) {
    return;
  }
  const searchParam = state.materialSearch.trim() ? `&search=${encodeURIComponent(state.materialSearch.trim())}` : "";
  const result = await requestJson(`/api/materials?languageId=${state.selectedStudyLanguageId}&offset=${state.materialOffset}${searchParam}`);
  state.materials = state.materials.concat(result.materials);
  state.materialOffset += result.materials.length;
  state.materialHasMore = result.materials.length === result.pageSize;
  if (state.selectedMaterialId && !state.materials.some((material) => material.id === state.selectedMaterialId)) {
    state.selectedMaterialId = null;
  }
  renderMaterialList();
  renderImportProgress();
  renderReaderTokens();
  scheduleTranslationRefresh();
}

/**
 * Attaches all DOM event listeners for the materials feature. Must be called
 * once during application bootstrap.
 *
 * Registered interactions include:
 * - Import modal open and close buttons.
 * - Import form submission: validates file size and material count limits
 *   before POSTing to `/api/materials` as multipart form data; tracks the
 *   resulting material ID for progress display and auto-opens it when ready.
 * - Material search input with 200 ms debounce triggering a reset load.
 * - Material list scroll triggering paginated load of additional materials.
 * - Material list clicks: rename button (enters inline edit), delete button
 *   (confirms then calls DELETE `/api/materials/:id`), material title button
 *   (selects and opens in reader).
 * - Rename form submit and focusout saving the new title via
 *   PATCH `/api/materials/:id`.
 * - Escape key inside the rename input to cancel without saving.
 *
 * @sideeffects
 * - Adds event listeners on `elements.materialImportOpen`,
 *   `elements.materialImportModalClose`, `elements.materialImportForm`,
 *   `elements.materialSearch`, `elements.materialList`, and keyboard events
 *   within the list.
 */
export function bindMaterialsEvents() {
  elements.materialImportOpen.addEventListener("click", openMaterialImportModal);
  elements.materialImportModalClose.addEventListener("click", closeMaterialImportModal);

  elements.materialImportForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const file = elements.materialFile.files[0];
    if (!file) {
      elements.materialImportStatus.textContent = t("reader.chooseFile");
      return;
    }
    if (file.size > BETA_MAX_MATERIAL_UPLOAD_BYTES) {
      elements.materialImportStatus.textContent = t("errors.materialFileTooLarge", {
        maxMegabytes: String(Math.round(BETA_MAX_MATERIAL_UPLOAD_BYTES / 1024 / 1024))
      });
      return;
    }
    if (state.materials.length >= BETA_MAX_MATERIALS_PER_USER) {
      elements.materialImportStatus.textContent = t("errors.materialLimitReached", {
        maxDocuments: String(BETA_MAX_MATERIALS_PER_USER)
      });
      return;
    }
    const submitButton = elements.materialImportForm.querySelector("button[type=submit]");
    submitButton.disabled = true;
    elements.materialImportStatus.textContent = t("reader.importing");
    state.importInProgress = true;
    state.importingMaterialId = null;
    renderImportProgress();
    closeMaterialImportModal();
    try {
      const form = new FormData();
      form.append("languageId", String(state.selectedStudyLanguageId));
      form.append("file", file);
      const response = await fetch(apiUrl("/api/materials"), { method: "POST", headers: await csrfHeaders(), body: form, credentials: "include" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(apiErrorMessage(payload));
      }
      elements.materialImportForm.reset();
      elements.materialImportStatus.textContent = t("reader.importStarted");
      state.importingMaterialId = payload.material.id;
      state.importInProgress = false;
      await loadMaterials(true);
      await loadDashboard();
    } catch (error) {
      elements.materialImportStatus.textContent = error.message;
      state.importingMaterialId = null;
    } finally {
      state.importInProgress = false;
      renderImportProgress();
      submitButton.disabled = false;
    }
  });

  let searchDebounceId = null;
  elements.materialSearch.addEventListener("input", () => {
    state.materialSearch = elements.materialSearch.value;
    window.clearTimeout(searchDebounceId);
    searchDebounceId = window.setTimeout(() => {
      loadMaterials(true).catch((error) => {
        elements.materialImportStatus.textContent = error.message;
      });
    }, 200);
  });

  elements.materialList.addEventListener("scroll", async () => {
    const remainingScroll = elements.materialList.scrollHeight - elements.materialList.scrollTop - elements.materialList.clientHeight;
    if (remainingScroll < 120) {
      await loadMaterials(false);
    }
  });

  elements.materialList.addEventListener("click", async (event) => {
    const renameButton = event.target.closest("[data-rename-material-id]");
    if (renameButton) {
      const materialId = Number(renameButton.dataset.renameMaterialId);
      const material = state.materials.find((entry) => entry.id === materialId);
      if (!material) {
        return;
      }
      state.materialRenameId = materialId;
      renderMaterialList();
      focusMaterialRenameInput();
      return;
    }

    const deleteButton = event.target.closest("[data-delete-material-id]");
    if (deleteButton) {
      const materialId = Number(deleteButton.dataset.deleteMaterialId);
      const material = state.materials.find((entry) => entry.id === materialId);
      if (!material || !confirm(t("reader.deleteMaterialConfirm", { title: material.title }))) {
        return;
      }
      deleteButton.disabled = true;
      try {
        await requestJson(`/api/materials/${materialId}`, { method: "DELETE" });
        state.materials = state.materials.filter((entry) => entry.id !== materialId);
        if (state.selectedMaterialId === materialId) {
          state.selectedMaterialId = null;
          cacheSelectedMaterialId(null);
          state.currentMaterial = null;
          state.readerTokens = [];
          state.readerStart = 0;
        }
        elements.materialImportStatus.textContent = t("reader.deletedMaterial");
        renderMaterialList();
        renderReaderTokens();
        await loadDashboard();
      } catch (error) {
        elements.materialImportStatus.textContent = error.message;
        deleteButton.disabled = false;
      }
      return;
    }

    const button = event.target.closest("[data-material-id]");
    if (!button) {
      return;
    }
    const material = state.materials.find((entry) => entry.id === Number(button.dataset.materialId));
    if (material?.translationStatus && !material.translationStatus.ready) {
      elements.materialImportStatus.textContent = t("reader.translatingWait");
      return;
    }
    state.selectedMaterialId = Number(button.dataset.materialId);
    cacheSelectedMaterialId(state.selectedMaterialId);
    state.readerStart = Number(material.readerStart) || 0;
    state.readerSidebarTab = "read";
    renderMaterialList();
    renderReaderSidebarTabs();
    await loadMaterialReader();
  });

  elements.materialList.addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-rename-material-form]");
    if (!form) {
      return;
    }
    event.preventDefault();
    const materialId = Number(form.dataset.renameMaterialForm);
    const input = form.elements.title;
    try {
      await saveMaterialRename(materialId, input.value);
    } catch (error) {
      elements.materialImportStatus.textContent = error.message;
      focusMaterialRenameInput();
    }
  });

  elements.materialList.addEventListener("focusout", async (event) => {
    const input = event.target.closest(".material-title-input");
    if (!input || input.dataset.cancelRename === "true") {
      return;
    }
    const form = input.closest("[data-rename-material-form]");
    if (!form) {
      return;
    }
    try {
      await saveMaterialRename(Number(form.dataset.renameMaterialForm), input.value);
    } catch (error) {
      elements.materialImportStatus.textContent = error.message;
      focusMaterialRenameInput();
    }
  });

  elements.materialList.addEventListener("keydown", (event) => {
    const input = event.target.closest(".material-title-input");
    if (!input || event.key !== "Escape") {
      return;
    }
    input.dataset.cancelRename = "true";
    state.materialRenameId = null;
    renderMaterialList();
  });
}
