import { apiErrorMessage, apiUrl, csrfHeaders, requestJson } from "../../api.js";
import { elements } from "../../dom.js";
import { t } from "../../i18n.js";
import { BETA_MAX_MATERIALS_PER_USER, BETA_MAX_MATERIAL_UPLOAD_BYTES, state } from "../../state.js";
import { renderImportProgress, renderMaterialList, renderReaderTokens } from "../../views/reader.js";

let loadDashboard = async () => {};
let loadMaterialReader = async () => {};
let loadWords = async () => {};
let translationPollId = null;

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

export async function loadMaterials(reset = false) {
  if (!state.selectedStudyLanguageId) {
    if (translationPollId) {
      window.clearInterval(translationPollId);
      translationPollId = null;
    }
    state.materials = [];
    state.selectedMaterialId = null;
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
    state.readerStart = Number(material.readerStart) || 0;
    renderMaterialList();
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
