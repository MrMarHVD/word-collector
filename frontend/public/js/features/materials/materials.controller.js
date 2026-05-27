import { apiUrl, requestJson } from "../../api.js";
import { elements } from "../../dom.js";
import { formatCount, t } from "../../i18n.js";
import { state } from "../../state.js";
import { renderMaterialList, renderReaderTokens } from "../../views/reader.js";

let loadDashboard = async () => {};
let loadMaterialReader = async () => {};
let loadWords = async () => {};
let translationPollId = null;

export function configureMaterialsController(options) {
  loadDashboard = options.loadDashboard;
  loadMaterialReader = options.loadMaterialReader;
  loadWords = options.loadWords;
}

function hasPendingTranslations() {
  return state.materials.some((material) => material.translationStatus && !material.translationStatus.ready);
}

function scheduleTranslationRefresh() {
  if (translationPollId || !hasPendingTranslations()) {
    return;
  }
  translationPollId = window.setInterval(async () => {
    try {
      if (!hasPendingTranslations()) {
        window.clearInterval(translationPollId);
        translationPollId = null;
        return;
      }
      await loadMaterials(true);
      await loadWords();
      if (state.selectedMaterialId && state.currentMaterial?.translationStatus && !state.currentMaterial.translationStatus.ready) {
        await loadMaterialReader(state.readerStart, { persist: false });
      }
    } catch (error) {
      console.error(error);
    }
  }, 1500);
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
  const result = await requestJson(`/api/materials?languageId=${state.selectedStudyLanguageId}&offset=${state.materialOffset}`);
  state.materials = state.materials.concat(result.materials);
  state.materialOffset += result.materials.length;
  state.materialHasMore = result.materials.length === result.pageSize;
  if (state.selectedMaterialId && !state.materials.some((material) => material.id === state.selectedMaterialId)) {
    state.selectedMaterialId = null;
  }
  renderMaterialList();
  renderReaderTokens();
  scheduleTranslationRefresh();
}

export function bindMaterialsEvents() {
  elements.materialImportForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const file = elements.materialFile.files[0];
    if (!file) {
      elements.materialImportStatus.textContent = t("reader.chooseFile");
      return;
    }
    const submitButton = elements.materialImportForm.querySelector("button");
    submitButton.disabled = true;
    elements.materialImportStatus.textContent = t("reader.importing");
    try {
      const form = new FormData();
      form.append("languageId", String(state.selectedStudyLanguageId));
      form.append("file", file);
      const response = await fetch(apiUrl("/api/materials"), { method: "POST", body: form, credentials: "include" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || t("errors.requestFailed"));
      }
      elements.materialImportForm.reset();
      elements.materialImportStatus.textContent = t("reader.imported", { words: formatCount(payload.tokenCount) });
      state.selectedMaterialId = payload.material.id;
      await loadMaterials(true);
      await loadMaterialReader(0, { persist: true });
      await loadDashboard();
    } catch (error) {
      elements.materialImportStatus.textContent = error.message;
    } finally {
      submitButton.disabled = false;
    }
  });

  elements.materialList.addEventListener("scroll", async () => {
    const remainingScroll = elements.materialList.scrollHeight - elements.materialList.scrollTop - elements.materialList.clientHeight;
    if (remainingScroll < 120) {
      await loadMaterials(false);
    }
  });

  elements.materialList.addEventListener("click", async (event) => {
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
}
