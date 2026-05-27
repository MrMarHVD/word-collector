import { requestJson } from "../../api.js";
import { elements } from "../../dom.js";
import { t } from "../../i18n.js";
import { state } from "../../state.js";
import { renderCollectionsList, renderSelectedCollectionStats } from "../../views/dashboard.js";
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
    elements.wordPagination.hidden = true;
    elements.emptyState.hidden = false;
    elements.emptyState.textContent = t("collections.empty");
    return;
  }

  const params = new URLSearchParams();
  if (state.search) {
    params.set("search", state.search);
  }

  const endpoint = state.selectedCollectionId === "all"
    ? `/api/languages/${state.selectedStudyLanguageId}/words?${params}`
    : `/api/collections/${state.selectedCollectionId}/words?${params}`;

  if (state.selectedCollectionId === "all" && !state.selectedStudyLanguageId) {
    state.words = [];
    renderWords(state.words);
    return;
  }

  const result = await requestJson(endpoint);
  state.words = result.words;
  renderWords(result.words);
}

async function selectCollection(value) {
  state.selectedCollectionId = value === "all" ? "all" : Number(value);
  state.search = "";
  elements.searchInput.value = "";
  resetWordWindow();
  renderCollectionsList();
  renderSelectedCollectionStats();
  await loadWords();
}

export function bindCollectionsEvents() {
  elements.collectionsList.addEventListener("click", async (event) => {
    const button = event.target.closest(".collection-button");
    if (!button) {
      return;
    }
    await selectCollection(button.dataset.collectionId);
  });

  elements.searchInput.addEventListener("input", async (event) => {
    state.search = event.target.value.trim();
    resetWordWindow();
    await loadWords();
  });

  elements.tableWrap.addEventListener("scroll", loadMoreWordsIfNeeded);

  elements.wordPrevPage.addEventListener("click", () => {
    if (state.wordsPage <= 0) return;
    state.wordsPage -= 1;
    renderWords(state.words);
  });

  elements.wordNextPage.addEventListener("click", () => {
    state.wordsPage += 1;
    renderWords(state.words);
  });

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
