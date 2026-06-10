import { requestJson } from "../../api.js";
import { elements } from "../../dom.js";
import { state } from "../../state.js";
import { normalizeStatus } from "../../shared/status.js";
import { fitReaderTokensToPage, renderReaderSidebar, renderReaderSidebarTabs, renderReaderTokens, renderReaderWordInfo } from "../../views/reader.js";

const MIN_READER_PANEL_WIDTH = 360;
const MIN_READER_PANEL_HEIGHT = 520;
const MAX_READER_SIDEBAR_WIDTH = 340;
const MAX_READER_SIDEBAR_WIDTH_SMALL = 240;
const READER_PANEL_BOTTOM_MARGIN = 16;
const FIT_READER_FETCH_LIMIT = 1000;

let loadDashboard = async () => {};
let readerPageTurnInProgress = false;
let highlightOpacityFrame = 0;

export function configureReaderController(options) {
  loadDashboard = options.loadDashboard;
}

async function saveMaterialReaderStart(materialId, start) {
  await requestJson(`/api/materials/${materialId}`, {
    method: "PATCH",
    body: JSON.stringify({ readerStart: start })
  });
  state.materials = state.materials.map((material) => (material.id === materialId ? { ...material, readerStart: start } : material));
}

export async function loadMaterialReader(start = null, { persist = true } = {}) {
  if (!state.selectedMaterialId) {
    state.currentMaterial = null;
    state.readerTokens = [];
    state.readerFetchedTokens = [];
    renderReaderTokens();
    return;
  }
  const pageLimit = state.readerWordsPerPage === "fit" ? FIT_READER_FETCH_LIMIT : state.readerWordsPerPage;
  const params = new URLSearchParams({ limit: String(pageLimit) });
  if (start !== null && start !== undefined) {
    params.set("start", String(Math.max(start, 0)));
  }
  const result = await requestJson(`/api/materials/${state.selectedMaterialId}?${params}`);
  state.currentMaterial = result.material;
  state.currentMaterial.translationStatus = result.translationStatus;
  state.readerStart = result.start;
  state.readerFetchedTokens = result.tokens;
  state.readerTokens = result.tokens;
  state.materials = state.materials.map((material) => (material.id === state.selectedMaterialId ? { ...material, readerStart: result.start } : material));
  if (persist && result.translationStatus?.ready) {
    await saveMaterialReaderStart(state.selectedMaterialId, result.start);
  }
  renderReaderTokens();
  fitReaderTokensToPage();
  renderReaderSidebarTabs();
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function startReaderResize(event, target) {
  event.preventDefault();
  const focusMode = state.activeTab === "reader" && state.readerFocusMode;
  const startX = event.clientX;
  const startY = event.clientY;
  const layoutRect = elements.readerLayout.getBoundingClientRect();
  const sidebarWidth = focusMode || state.readerSidebarCollapsed ? 0 : elements.readerSidebar.getBoundingClientRect().width;
  const panelRect = elements.readerPanel.getBoundingClientRect();
  const initialWidth = target === "sidebar" ? state.readerSidebarWidth : target === "info" ? state.readerInfoWidth : panelRect.width;
  const initialHeight = panelRect.height;
  const availablePanelWidth = Math.max(1, Math.floor(layoutRect.width - sidebarWidth));
  const minPanelWidth = Math.min(MIN_READER_PANEL_WIDTH, availablePanelWidth);
  const minSidebarWidth = window.matchMedia("(max-width: 760px)").matches ? 160 : 240;
  const minWidth = target === "sidebar" ? minSidebarWidth : target === "info" ? 220 : minPanelWidth;
  const maxPanelWidth = Math.max(minPanelWidth, availablePanelWidth);
  const maxSidebarWidth = window.matchMedia("(max-width: 760px)").matches ? MAX_READER_SIDEBAR_WIDTH_SMALL : MAX_READER_SIDEBAR_WIDTH;
  const maxWidth = target === "panel" ? maxPanelWidth : target === "sidebar" ? Math.max(minWidth, maxSidebarWidth) : Math.max(minWidth, Math.floor(window.innerWidth * 0.55));
  const maxPanelHeight = Math.max(1, window.innerHeight - panelRect.top - READER_PANEL_BOTTOM_MARGIN);
  const minHeight = target === "panel" ? Math.min(MIN_READER_PANEL_HEIGHT, maxPanelHeight) : 320;
  const maxHeight = target === "panel" ? maxPanelHeight : Math.max(minHeight, window.innerHeight - 90);

  function resize(moveEvent) {
    const nextWidth = clamp(initialWidth + moveEvent.clientX - startX, minWidth, maxWidth);
    if (target === "sidebar") {
      state.readerSidebarWidth = nextWidth;
      localStorage.setItem("wordMarkerReaderSidebarWidth", String(nextWidth));
    } else if (target === "info") {
      state.readerInfoWidth = nextWidth;
      localStorage.setItem("wordMarkerReaderInfoWidth", String(nextWidth));
    } else {
      const nextHeight = clamp(initialHeight + moveEvent.clientY - startY, minHeight, maxHeight);
      if (state.readerFocusMode) {
        state.readerFocusPanelWidth = nextWidth;
        localStorage.setItem("wordMarkerReaderFocusPanelWidth", String(nextWidth));
      } else {
        state.readerPanelWidth = nextWidth;
        state.readerPanelHeight = nextHeight;
        localStorage.setItem("wordMarkerReaderPanelWidth", String(nextWidth));
        localStorage.setItem("wordMarkerReaderPanelHeight", String(nextHeight));
      }
    }
    renderReaderSidebar();
    fitReaderTokensToPage();
  }

  function stopResize() {
    document.removeEventListener("pointermove", resize);
    document.removeEventListener("pointerup", stopResize);
    document.body.classList.remove("is-resizing-reader");
  }

  document.body.classList.add("is-resizing-reader");
  document.addEventListener("pointermove", resize);
  document.addEventListener("pointerup", stopResize);
}

function closeReaderWordInfo() {
  renderReaderWordInfo(null);
  elements.readerText.querySelectorAll(".reader-token").forEach((entry) => entry.classList.remove("is-selected"));
}

async function markCurrentReaderPageKnown() {
  if (!state.readerAutoMarkKnownOnPageTurn) {
    return false;
  }
  const wordIds = [...new Set(state.readerTokens.filter((token) => token.wordId && normalizeStatus(token.status || (token.known ? "known" : "unknown")) === "unknown").map((token) => token.wordId))];
  if (!wordIds.length) {
    return false;
  }
  await Promise.all(
    wordIds.map((wordId) =>
      requestJson(`/api/words/${wordId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "known" })
      })
    )
  );
  state.readerTokens = state.readerTokens.map((token) => (wordIds.includes(token.wordId) ? { ...token, known: true, status: "known" } : token));
  return true;
}

async function markReaderWordLearning(wordId) {
  const tokenStatus = normalizeStatus(state.readerTokens.find((token) => token.wordId === wordId)?.status || "unknown");
  if (!wordId || tokenStatus !== "unknown") {
    return false;
  }
  await requestJson(`/api/words/${wordId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "learning" })
  });
  state.readerTokens = state.readerTokens.map((token) => (token.wordId === wordId ? { ...token, known: false, status: "learning" } : token));
  elements.readerText.querySelectorAll(`[data-word-id="${wordId}"]`).forEach((entry) => {
    entry.dataset.status = "learning";
  });
  return true;
}

function updateReaderWordInfoStatus(status) {
  const toggle = elements.readerWordInfo.querySelector(".status-toggle");
  if (!toggle) {
    return;
  }
  toggle.querySelectorAll(".status-segment").forEach((segment) => {
    const active = segment.dataset.status === status;
    segment.dataset.active = String(active);
    segment.setAttribute("aria-pressed", String(active));
  });
  const statusValue = elements.readerWordInfo.querySelector("dl dd:last-child");
  const activeSegment = toggle.querySelector(`.status-segment[data-status="${status}"]`);
  if (statusValue && activeSegment) {
    statusValue.textContent = activeSegment.textContent;
  }
}

function isTextInputTarget(target) {
  return target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function animateReaderPageTurn(direction) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }
  const className = direction === "next" ? "is-page-flip-next" : "is-page-flip-prev";
  elements.readerText.classList.remove("is-page-flip-next", "is-page-flip-prev");
  void elements.readerText.offsetWidth;
  elements.readerText.classList.add(className);
}

function applyReaderHighlightOpacity(value) {
  state.readerHighlightOpacity = Number(value);
  if (highlightOpacityFrame) {
    cancelAnimationFrame(highlightOpacityFrame);
  }
  highlightOpacityFrame = requestAnimationFrame(() => {
    elements.readerText.style.setProperty("--readerHighlightOpacity", String(state.readerHighlightOpacity));
    highlightOpacityFrame = 0;
  });
}

function renderReaderLayout() {
  renderReaderSidebar();
  fitReaderTokensToPage();
}

async function turnReaderPage(direction) {
  if (readerPageTurnInProgress || !state.currentMaterial?.translationStatus?.ready) {
    return;
  }
  const pageStep = state.readerWordsPerPage === "fit" ? Math.max(state.readerTokens.length, 1) : Number(state.readerWordsPerPage);
  const nextStart = direction === "next"
    ? state.readerStart + pageStep
    : Math.max(state.readerStart - pageStep, 0);
  const currentEnd = state.readerStart + state.readerTokens.length;
  const canTurn = direction === "next"
    ? currentEnd < state.currentMaterial.wordCount
    : state.readerStart > 0;
  if (!canTurn) {
    return;
  }

  readerPageTurnInProgress = true;
  try {
    const markedKnown = await markCurrentReaderPageKnown();
    await loadMaterialReader(nextStart);
    animateReaderPageTurn(direction);
    if (markedKnown) {
      await loadDashboard();
    }
  } finally {
    readerPageTurnInProgress = false;
  }
}

export function bindReaderEvents() {
  elements.readerSidebarToggle.addEventListener("click", () => {
    state.readerSidebarCollapsed = !state.readerSidebarCollapsed;
    localStorage.setItem("wordMarkerReaderSidebarCollapsed", String(state.readerSidebarCollapsed));
    renderReaderLayout();
  });

  elements.readerSidebarOpen.addEventListener("click", () => {
    state.readerSidebarCollapsed = false;
    localStorage.setItem("wordMarkerReaderSidebarCollapsed", String(state.readerSidebarCollapsed));
    renderReaderLayout();
  });

  elements.readerSidebarResize.addEventListener("pointerdown", (event) => startReaderResize(event, "sidebar"));
  elements.readerPanelResize.addEventListener("pointerdown", (event) => startReaderResize(event, "panel"));

  elements.readerFocusToggle.addEventListener("click", () => {
    state.readerFocusMode = !state.readerFocusMode;
    localStorage.setItem("wordMarkerReaderFocusMode", String(state.readerFocusMode));
    closeReaderWordInfo();
    renderReaderLayout();
  });

  elements.readerSidebarTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-reader-sidebar-tab]");
    if (!button) {
      return;
    }
    state.readerSidebarTab = button.dataset.readerSidebarTab;
    renderReaderSidebarTabs();
  });

  elements.readerAutoMarkKnown.addEventListener("change", (event) => {
    state.readerAutoMarkKnownOnPageTurn = event.target.checked;
    localStorage.setItem("wordMarkerReaderAutoMarkKnownOnPageTurn", String(state.readerAutoMarkKnownOnPageTurn));
    renderReaderSidebarTabs();
  });

  elements.readerAutoMarkLearning.addEventListener("change", (event) => {
    state.readerAutoMarkLearningOnClick = event.target.checked;
    localStorage.setItem("wordMarkerReaderAutoMarkLearningOnClick", String(state.readerAutoMarkLearningOnClick));
    renderReaderSidebarTabs();
  });

  elements.readerShowWordSpaces.addEventListener("change", (event) => {
    state.readerShowWordSpaces = event.target.checked;
    localStorage.setItem("wordMarkerReaderShowWordSpaces", String(state.readerShowWordSpaces));
    renderReaderTokens();
    fitReaderTokensToPage();
  });

  elements.readerHighlightOpacity.addEventListener("input", (event) => {
    applyReaderHighlightOpacity(event.target.value);
  });

  elements.readerHighlightOpacity.addEventListener("change", (event) => {
    applyReaderHighlightOpacity(event.target.value);
    localStorage.setItem("wordMarkerReaderHighlightOpacity", String(state.readerHighlightOpacity));
  });

  elements.readerFontSize.addEventListener("input", (event) => {
    state.readerFontSize = Number(event.target.value);
    localStorage.setItem("wordMarkerReaderFontSize", String(state.readerFontSize));
    renderReaderTokens();
    fitReaderTokensToPage();
  });

  elements.readerWordsPerPage.addEventListener("change", async (event) => {
    state.readerWordsPerPage = event.target.value === "fit" ? "fit" : Number(event.target.value);
    localStorage.setItem("wordMarkerReaderWordsPerPage", String(state.readerWordsPerPage));
    await loadMaterialReader(state.readerStart);
  });

  elements.readerPrevPage.addEventListener("click", async () => {
    await turnReaderPage("prev");
  });

  elements.readerNextPage.addEventListener("click", async () => {
    await turnReaderPage("next");
  });

  elements.readerText.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-token-id]");
    if (!button) {
      return;
    }
    elements.readerText.querySelectorAll(".reader-token").forEach((entry) => entry.classList.remove("is-selected"));
    button.classList.add("is-selected");
    const token = state.readerTokens.find((entry) => entry.id === Number(button.dataset.tokenId));
    renderReaderWordInfo(token, button);
    requestJson(`/api/words/${button.dataset.wordId}/click`, { method: "POST" }).catch(() => {});
    const changed = state.readerAutoMarkLearningOnClick ? await markReaderWordLearning(Number(button.dataset.wordId)) : false;
    if (changed) {
      updateReaderWordInfoStatus("learning");
      await loadDashboard();
    }
  });

  elements.readerWordInfo.addEventListener("click", async (event) => {
    if (event.target.closest("[data-reader-word-info-close]")) {
      closeReaderWordInfo();
      return;
    }
    const disambiguate = event.target.closest("[data-disambiguate]");
    if (disambiguate) {
      const panel = elements.readerWordInfo.querySelector("[data-disambiguation-panel]");
      if (panel) {
        panel.hidden = !panel.hidden;
        disambiguate.setAttribute("aria-expanded", String(!panel.hidden));
      }
      return;
    }
    const segment = event.target.closest(".status-segment");
    if (!segment) {
      return;
    }
    const toggle = segment.closest(".status-toggle");
    const wordId = Number(toggle?.dataset.readerWordId);
    const status = segment.dataset.status;
    if (!wordId || segment.dataset.active === "true") {
      return;
    }
    segment.disabled = true;
    try {
      await requestJson(`/api/words/${wordId}`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      await loadMaterialReader(state.readerStart);
      closeReaderWordInfo();
      await loadDashboard();
    } finally {
      segment.disabled = false;
    }
  });

  document.addEventListener("click", (event) => {
    if (elements.readerWordInfo.hidden || elements.readerWordInfo.contains(event.target) || event.target.closest(".reader-token")) {
      return;
    }
    closeReaderWordInfo();
  });

  document.addEventListener("keydown", async (event) => {
    if (state.activeTab !== "reader" || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || isTextInputTarget(event.target)) {
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      await turnReaderPage("prev");
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      await turnReaderPage("next");
    } else if (event.key === "Escape" && state.readerFocusMode) {
      state.readerFocusMode = false;
      localStorage.setItem("wordMarkerReaderFocusMode", "false");
      closeReaderWordInfo();
      renderReaderLayout();
    }
  });

  elements.readerWordInfo.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".reader-word-info-resize")) {
      startReaderResize(event, "info");
    }
  });

  window.addEventListener("resize", renderReaderLayout);
}
