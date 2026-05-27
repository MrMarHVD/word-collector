import { requestJson } from "../../api.js";
import { elements } from "../../dom.js";
import { t } from "../../i18n.js";
import { state } from "../../state.js";
import { renderSelectedCollectionStats } from "../../views/dashboard.js";
import { resetWordWindow } from "../../views/shell.js";
import { loadMoreWordsIfNeeded, renderWords } from "../../views/words.js";

let loadDashboard = async () => {};

export function configureCollectionsController(options) {
  loadDashboard = options.loadDashboard;
}

export async function loadWords() {
  if (!state.selectedCollectionId) {
    state.words = [];
    elements.wordRows.innerHTML = "";
    elements.wordListStatus.hidden = true;
    elements.emptyState.hidden = false;
    elements.emptyState.textContent = t("collections.empty");
    return;
  }

  const params = new URLSearchParams();
  if (state.search) {
    params.set("search", state.search);
  }

  const result = await requestJson(`/api/collections/${state.selectedCollectionId}/words?${params}`);
  state.words = result.words;
  renderWords(result.words);
}

export function bindCollectionsEvents() {
  elements.collectionSelect.addEventListener("change", async (event) => {
    state.selectedCollectionId = Number(event.target.value) || null;
    state.search = "";
    elements.searchInput.value = "";
    resetWordWindow();
    renderSelectedCollectionStats();
    await loadWords();
  });

  elements.saveCollectionLanguageButton.addEventListener("click", async () => {
    if (!state.selectedCollectionId) {
      return;
    }

    elements.saveCollectionLanguageButton.disabled = true;
    try {
      await requestJson(`/api/collections/${state.selectedCollectionId}`, {
        method: "PATCH",
        body: JSON.stringify({ languageId: Number(elements.collectionLanguageSelect.value) })
      });
      await loadDashboard();
    } finally {
      elements.saveCollectionLanguageButton.disabled = false;
    }
  });

  elements.deleteCollectionButton.addEventListener("click", async () => {
    if (!state.selectedCollectionId) {
      return;
    }

    const collection = (state.dashboard.allCollections || state.dashboard.collections).find((entry) => entry.id === state.selectedCollectionId);
    const confirmed = window.confirm(t("collections.deleteConfirm", { name: collection?.name || t("collections.collection") }));
    if (!confirmed) {
      return;
    }

    elements.deleteCollectionButton.disabled = true;
    await requestJson(`/api/collections/${state.selectedCollectionId}`, { method: "DELETE" });
    state.selectedCollectionId = null;
    state.search = "";
    elements.searchInput.value = "";
    await loadDashboard();
  });

  elements.searchInput.addEventListener("input", async (event) => {
    state.search = event.target.value.trim();
    resetWordWindow();
    await loadWords();
  });

  elements.tableWrap.addEventListener("scroll", loadMoreWordsIfNeeded);

  elements.wordRows.addEventListener("click", async (event) => {
    const button = event.target.closest(".known-toggle");
    if (!button) {
      return;
    }

    const id = Number(button.dataset.wordId);
    const known = button.dataset.known !== "true";
    button.disabled = true;

    try {
      await requestJson(`/api/words/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ known })
      });
      await loadDashboard();
    } finally {
      button.disabled = false;
    }
  });
}
