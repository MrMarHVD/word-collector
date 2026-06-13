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

function isMobileCollectionLayout() {
  return window.matchMedia("(max-width: 760px)").matches;
}

function renderDeleteButtonState() {
  if (!elements.deleteSelectedButton) {
    return;
  }
  elements.deleteSelectedButton.disabled = state.selectedWordIds.size === 0;
}

// Show or clear the inline error shown beside the delete button in the vocab tab.
function setWordActionError(message = "") {
  if (!elements.wordActionError) {
    return;
  }
  elements.wordActionError.textContent = message;
  elements.wordActionError.hidden = !message;
}

export async function loadWords() {
  state.selectedWordIds.clear();
  state.selectionAnchorId = null;
  renderDeleteButtonState();
  setWordActionError();

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

function handleRowSelection(event, wordId) {
  const ids = state.words.map((entry) => entry.id);
  if (event.shiftKey && state.selectionAnchorId != null) {
    const anchorIndex = ids.indexOf(state.selectionAnchorId);
    const currentIndex = ids.indexOf(wordId);
    if (anchorIndex < 0 || currentIndex < 0) {
      return;
    }
    const [from, to] = anchorIndex <= currentIndex ? [anchorIndex, currentIndex] : [currentIndex, anchorIndex];
    state.selectedWordIds = new Set(ids.slice(from, to + 1));
  } else if (event.metaKey || event.ctrlKey) {
    if (state.selectedWordIds.has(wordId)) {
      state.selectedWordIds.delete(wordId);
    } else {
      state.selectedWordIds.add(wordId);
    }
    state.selectionAnchorId = wordId;
  } else {
    state.selectedWordIds = new Set([wordId]);
    state.selectionAnchorId = wordId;
  }
  renderWords(state.words);
  renderDeleteButtonState();
}

function dragPayload(draggedId) {
  if (state.selectedWordIds.has(draggedId)) {
    return Array.from(state.selectedWordIds);
  }
  state.selectedWordIds = new Set([draggedId]);
  state.selectionAnchorId = draggedId;
  renderWords(state.words);
  renderDeleteButtonState();
  return [draggedId];
}

function clearCollectionDropHints() {
  elements.collectionsList.querySelectorAll(".collection-button.is-drop-target")
    .forEach((node) => node.classList.remove("is-drop-target"));
}

async function moveSelectedWords(wordIds, destinationId) {
  setWordActionError();
  try {
    await requestJson("/api/words/move", {
      method: "POST",
      body: JSON.stringify({ wordIds, collectionId: destinationId })
    });
  } catch (error) {
    setWordActionError(error.message);
    return;
  }
  await loadDashboard();
}

export function bindCollectionsEvents() {
  elements.deleteSelectedButton.addEventListener("click", async () => {
    if (!state.selectedWordIds.size) {
      return;
    }
    const ids = Array.from(state.selectedWordIds);
    if (!confirm(t("collections.deleteConfirm", { count: ids.length }))) {
      return;
    }
    elements.deleteSelectedButton.disabled = true;
    setWordActionError();
    try {
      await requestJson("/api/words/delete", {
        method: "POST",
        body: JSON.stringify({ wordIds: ids })
      });
      await loadDashboard();
    } catch (error) {
      elements.deleteSelectedButton.disabled = false;
      setWordActionError(error.message);
    }
  });

  elements.collectionsList.addEventListener("click", async (event) => {
    const button = event.target.closest(".collection-button");
    if (!button) {
      return;
    }
    await selectCollection(button.dataset.collectionId);
  });

  elements.collectionsSelect.addEventListener("change", async (event) => {
    await selectCollection(event.target.value);
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
    const disambiguate = event.target.closest("[data-word-disambiguate]");
    if (disambiguate) {
      const id = Number(disambiguate.dataset.wordDisambiguate);
      state.expandedDisambiguationWordId = state.expandedDisambiguationWordId === id ? null : id;
      renderWords(state.words);
      return;
    }

    const segment = event.target.closest(".status-segment");
    if (segment) {
      const toggle = segment.closest(".status-toggle");
      const id = Number(toggle?.dataset.wordId);
      const status = segment.dataset.status;
      if (!id || segment.dataset.active === "true") {
        return;
      }
      // When the clicked word is part of a multi-selection, apply the chosen
      // status to every selected word; otherwise update just this one.
      const ids = state.selectedWordIds.has(id) && state.selectedWordIds.size > 1
        ? Array.from(state.selectedWordIds)
        : [id];
      segment.disabled = true;
      try {
        if (ids.length > 1) {
          await requestJson("/api/words/status", {
            method: "POST",
            body: JSON.stringify({ wordIds: ids, status })
          });
        } else {
          await requestJson(`/api/words/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ status })
          });
        }
        await loadDashboard();
      } finally {
        segment.disabled = false;
      }
      return;
    }

    const row = event.target.closest(".word-row");
    if (!row) {
      return;
    }
    handleRowSelection(event, Number(row.dataset.wordId));
  });

  elements.wordRows.addEventListener("dragstart", (event) => {
    if (isMobileCollectionLayout()) {
      event.preventDefault();
      return;
    }
    const row = event.target.closest(".word-row");
    if (!row) {
      return;
    }
    const draggedId = Number(row.dataset.wordId);
    const ids = dragPayload(draggedId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-word-marker-words", JSON.stringify(ids));
    event.dataTransfer.setData("text/plain", String(draggedId));
    row.classList.add("is-dragging");
  });

  elements.wordRows.addEventListener("dragend", (event) => {
    const row = event.target.closest(".word-row");
    row?.classList.remove("is-dragging");
    clearCollectionDropHints();
  });

  elements.collectionsList.addEventListener("dragover", (event) => {
    const button = event.target.closest(".collection-button");
    if (!button) {
      return;
    }
    const collectionId = button.dataset.collectionId;
    if (collectionId === "all" || Number(collectionId) === Number(state.selectedCollectionId)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    button.classList.add("is-drop-target");
  });

  elements.collectionsList.addEventListener("dragleave", (event) => {
    const button = event.target.closest(".collection-button");
    button?.classList.remove("is-drop-target");
  });

  elements.collectionsList.addEventListener("drop", async (event) => {
    const button = event.target.closest(".collection-button");
    if (!button) {
      return;
    }
    const collectionId = button.dataset.collectionId;
    if (collectionId === "all") {
      return;
    }
    event.preventDefault();
    clearCollectionDropHints();
    let payload;
    try {
      payload = JSON.parse(event.dataTransfer.getData("application/x-word-marker-words"));
    } catch {
      const fallback = Number(event.dataTransfer.getData("text/plain"));
      payload = Number.isFinite(fallback) ? [fallback] : [];
    }
    if (!Array.isArray(payload) || !payload.length) {
      return;
    }
    await moveSelectedWords(payload, Number(collectionId));
  });
}
