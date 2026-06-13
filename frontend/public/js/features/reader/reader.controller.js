import { requestJson } from "../../api.js";
import { elements } from "../../dom.js";
import { t } from "../../i18n.js";
import { state } from "../../state.js";
import { normalizeStatus } from "../../shared/status.js";
import { escapeHtml } from "../../shared/html.js";
import { fitReaderTokensToPage, renderReaderSidebar, renderReaderSidebarTabs, renderReaderTokens, renderReaderWordInfo } from "../../views/reader.js";

const MIN_READER_PANEL_WIDTH = 360;
const MIN_READER_PANEL_HEIGHT = 520;
const MAX_READER_SIDEBAR_WIDTH = 340;
const MAX_READER_SIDEBAR_WIDTH_SMALL = 240;
const READER_PANEL_BOTTOM_MARGIN = 16;
const FIT_READER_FETCH_LIMIT = 1000;
const READER_HOLD_DELAY_MS = 360;
const READER_HOLD_CANCEL_DISTANCE = 12;
const READER_MENU_SELECTION_DISTANCE = 54;
const READER_MENU_RADIUS = 82;
const READER_MENU_MARGIN = 14;
const READER_SUPPRESS_CLICK_MS = 300;

let loadDashboard = async () => {};
let readerPageTurnInProgress = false;
let highlightOpacityFrame = 0;
let readerConvenienceMenu = null;

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

function removeReaderConvenienceMenu({ suppressClick = false } = {}) {
  if (!readerConvenienceMenu) {
    return;
  }
  clearTimeout(readerConvenienceMenu.timer);
  readerConvenienceMenu.button?.classList.remove("is-selected");
  readerConvenienceMenu.node?.remove();
  if (readerConvenienceMenu.active) {
    document.body.classList.remove("is-reader-convenience-active");
  }
  if (readerConvenienceMenu.moveHandler) {
    document.removeEventListener("pointermove", readerConvenienceMenu.moveHandler);
  }
  if (readerConvenienceMenu.upHandler) {
    document.removeEventListener("pointerup", readerConvenienceMenu.upHandler);
  }
  if (readerConvenienceMenu.cancelHandler) {
    document.removeEventListener("pointercancel", readerConvenienceMenu.cancelHandler);
  }
  readerConvenienceMenu = suppressClick ? { suppressClick: true } : null;
  if (suppressClick) {
    window.setTimeout(() => {
      if (readerConvenienceMenu?.suppressClick) {
        readerConvenienceMenu = null;
      }
    }, READER_SUPPRESS_CLICK_MS);
  }
}

function readerConvenienceActions(token) {
  return [
    { key: "unknown", type: "status", value: "unknown", label: t("word.unknown"), x: 0, y: -1 },
    { key: "learning", type: "status", value: "learning", label: t("word.learning"), x: -1, y: 0 },
    { key: "known", type: "status", value: "known", label: t("word.known"), x: 1, y: 0 },
    {
      key: "practice",
      type: "practice",
      label: t("reader.practice"),
      checked: Boolean(token.wantToPractice),
      x: 0,
      y: 1
    }
  ];
}

function closestReaderConvenienceAction(menu, clientX, clientY) {
  const dx = clientX - menu.originX;
  const dy = clientY - menu.originY;
  if (Math.hypot(dx, dy) < READER_MENU_SELECTION_DISTANCE) {
    return null;
  }
  return menu.actions.reduce((closest, action) => {
    const actionX = action.x * READER_MENU_RADIUS;
    const actionY = action.y * READER_MENU_RADIUS;
    const distance = Math.hypot(dx - actionX, dy - actionY);
    return !closest || distance < closest.distance ? { action, distance } : closest;
  }, null)?.action || null;
}

function updateReaderConvenienceSelection(clientX, clientY) {
  if (!readerConvenienceMenu?.active) {
    return;
  }
  const selected = closestReaderConvenienceAction(readerConvenienceMenu, clientX, clientY);
  readerConvenienceMenu.selectedKey = selected?.key || null;
  readerConvenienceMenu.node.querySelectorAll(".reader-convenience-option").forEach((option) => {
    const active = option.dataset.action === readerConvenienceMenu.selectedKey;
    option.classList.toggle("is-selected", active);
    option.setAttribute("aria-pressed", String(active));
  });
  readerConvenienceMenu.node.classList.toggle("has-selection", Boolean(readerConvenienceMenu.selectedKey));
}

function positionReaderConvenienceMenu(node, clientX, clientY) {
  node.style.setProperty("--readerMenuX", `${clientX}px`);
  node.style.setProperty("--readerMenuY", `${clientY}px`);
  node.style.setProperty("--readerMenuRadius", `${READER_MENU_RADIUS}px`);
}

function showReaderConvenienceMenu(menu) {
  const originX = clamp(menu.startX, READER_MENU_RADIUS + READER_MENU_MARGIN, window.innerWidth - READER_MENU_RADIUS - READER_MENU_MARGIN);
  const originY = clamp(menu.startY, READER_MENU_RADIUS + READER_MENU_MARGIN, window.innerHeight - READER_MENU_RADIUS - READER_MENU_MARGIN);
  const actions = readerConvenienceActions(menu.token);
  const node = document.createElement("div");
  node.className = "reader-convenience-menu";
  node.setAttribute("role", "menu");
  positionReaderConvenienceMenu(node, originX, originY);
  node.innerHTML = `
    <div class="reader-convenience-scrim"></div>
    <div class="reader-convenience-center" aria-hidden="true">
      <span>${escapeHtml(menu.token.surface)}</span>
    </div>
    ${actions.map((action) => `
      <button class="reader-convenience-option reader-convenience-${action.key}" type="button" role="menuitemradio" data-action="${action.key}" aria-pressed="false" style="--optionX:${action.x};--optionY:${action.y};">
        ${action.type === "practice" ? `<span class="reader-convenience-checkbox${action.checked ? " is-checked" : ""}" aria-hidden="true"></span>` : ""}
        <span>${escapeHtml(action.label)}</span>
      </button>
    `).join("")}
  `;
  document.body.append(node);
  document.body.classList.add("is-reader-convenience-active");
  closeReaderWordInfo();
  elements.readerText.querySelectorAll(".reader-token").forEach((entry) => entry.classList.remove("is-selected"));
  menu.button.classList.add("is-selected");
  Object.assign(menu, { active: true, actions, node, originX, originY });
}

function syncReaderWordTokens(wordId, updates) {
  state.readerTokens = state.readerTokens.map((token) => (token.wordId === wordId ? { ...token, ...updates } : token));
  elements.readerText.querySelectorAll(`[data-word-id="${wordId}"]`).forEach((entry) => {
    if (updates.status) {
      entry.dataset.status = updates.status;
    }
  });
}

async function applyReaderConvenienceAction(menu) {
  const action = menu.actions.find((entry) => entry.key === menu.selectedKey);
  const wordId = Number(menu.token.wordId);
  if (!action || !wordId) {
    return;
  }
  if (action.type === "status") {
    await requestJson(`/api/words/${wordId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: action.value })
    });
    syncReaderWordTokens(wordId, {
      status: action.value,
      known: action.value === "known",
      wantToPractice: action.value === "learning" ? menu.token.wantToPractice : 0
    });
  } else {
    const currentStatus = normalizeStatus(menu.token.status || (menu.token.known ? "known" : "unknown"));
    if (currentStatus !== "learning") {
      await requestJson(`/api/words/${wordId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "learning" })
      });
    }
    const wantToPractice = !Boolean(menu.token.wantToPractice);
    await requestJson(`/api/words/${wordId}/want-to-practice`, {
      method: "POST",
      body: JSON.stringify({ wantToPractice })
    });
    syncReaderWordTokens(wordId, { status: "learning", known: false, wantToPractice: wantToPractice ? 1 : 0 });
  }
  await loadDashboard();
}

function startReaderConveniencePress(event, button) {
  if (event.pointerType === "mouse" && event.button !== 0) {
    return;
  }
  const token = state.readerTokens.find((entry) => entry.id === Number(button.dataset.tokenId));
  if (!token?.wordId) {
    return;
  }
  removeReaderConvenienceMenu();
  const menu = {
    active: false,
    button,
    token,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    selectedKey: null
  };

  menu.moveHandler = (moveEvent) => {
    if (moveEvent.pointerId !== menu.pointerId) {
      return;
    }
    if (!menu.active) {
      const distance = Math.hypot(moveEvent.clientX - menu.startX, moveEvent.clientY - menu.startY);
      if (distance > READER_HOLD_CANCEL_DISTANCE) {
        removeReaderConvenienceMenu();
      }
      return;
    }
    moveEvent.preventDefault();
    updateReaderConvenienceSelection(moveEvent.clientX, moveEvent.clientY);
  };

  menu.upHandler = async (upEvent) => {
    if (upEvent.pointerId !== menu.pointerId) {
      return;
    }
    if (!menu.active) {
      removeReaderConvenienceMenu();
      return;
    }
    upEvent.preventDefault();
    updateReaderConvenienceSelection(upEvent.clientX, upEvent.clientY);
    const activeMenu = readerConvenienceMenu;
    removeReaderConvenienceMenu({ suppressClick: true });
    try {
      await applyReaderConvenienceAction(activeMenu);
    } catch {
      await loadMaterialReader(state.readerStart);
    }
  };

  menu.cancelHandler = (cancelEvent) => {
    if (cancelEvent.pointerId === menu.pointerId) {
      removeReaderConvenienceMenu({ suppressClick: menu.active });
    }
  };

  menu.timer = window.setTimeout(() => {
    if (readerConvenienceMenu !== menu) {
      return;
    }
    showReaderConvenienceMenu(menu);
  }, READER_HOLD_DELAY_MS);

  readerConvenienceMenu = menu;
  document.addEventListener("pointermove", menu.moveHandler, { passive: false });
  document.addEventListener("pointerup", menu.upHandler, { passive: false });
  document.addEventListener("pointercancel", menu.cancelHandler);
}

// The still-unknown words on the current page, to be auto-marked known. Must be
// collected before the page turns, since loadMaterialReader replaces the tokens.
function collectAutoMarkKnownWordIds() {
  if (!state.readerAutoMarkKnownOnPageTurn) {
    return [];
  }
  return [...new Set(state.readerTokens.filter((token) => token.wordId && normalizeStatus(token.status || (token.known ? "known" : "unknown")) === "unknown").map((token) => token.wordId))];
}

// Mark the given words known without blocking the page turn. The requests and
// the dashboard refresh run in the background so the reader stays responsive.
function markReaderWordsKnownInBackground(wordIds) {
  Promise.all(
    wordIds.map((wordId) =>
      requestJson(`/api/words/${wordId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "known" })
      })
    )
  )
    .then(() => loadDashboard())
    .catch(() => {});
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
  if (toggle) {
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
  // Keep the practice checkbox in step with the status, so a word auto-marked
  // "learning" on selection becomes markable without re-rendering the popup.
  const practice = elements.readerWordInfo.querySelector(".reader-practice-toggle");
  if (practice) {
    const checkbox = practice.querySelector("[data-reader-practice-checkbox]");
    const canPractice = status === "learning";
    practice.classList.toggle("is-disabled", !canPractice);
    if (canPractice) {
      practice.removeAttribute("title");
    } else {
      practice.setAttribute("title", t("reader.practiceHint"));
    }
    if (checkbox) {
      checkbox.disabled = !canPractice;
      if (!canPractice) {
        checkbox.checked = false;
      }
    }
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
    // Auto-marking known applies only when advancing; going back must not mark
    // the page you are leaving as known. Capture the words now, before the
    // tokens are replaced, then turn the page immediately and mark them in the
    // background so the user never waits on the network.
    const wordIdsToMark = direction === "next" ? collectAutoMarkKnownWordIds() : [];
    await loadMaterialReader(nextStart);
    animateReaderPageTurn(direction);
    if (wordIdsToMark.length) {
      markReaderWordsKnownInBackground(wordIdsToMark);
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

  function setReaderFocusMode(enabled) {
    state.readerFocusMode = enabled;
    localStorage.setItem("wordMarkerReaderFocusMode", String(state.readerFocusMode));
    closeReaderWordInfo();
    renderReaderLayout();
  }

  elements.readerFocusToggles.forEach((button) => {
    button.addEventListener("click", () => {
      setReaderFocusMode(true);
    });
  });

  elements.readerFocusExit.addEventListener("click", () => {
    setReaderFocusMode(false);
  });

  elements.readerSidebarTabs.forEach((tabs) => {
    tabs.addEventListener("click", (event) => {
      const button = event.target.closest("[data-reader-sidebar-tab]");
      if (!button) {
        return;
      }
      state.readerSidebarTab = button.dataset.readerSidebarTab;
      if (state.readerSidebarTab !== "read") {
        state.readerSidebarCollapsed = false;
        localStorage.setItem("wordMarkerReaderSidebarCollapsed", "false");
      }
      renderReaderSidebarTabs();
      renderReaderLayout();
    });
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

  // Page turning by gesture. Desktop: a two-finger horizontal trackpad swipe
  // produces horizontal wheel deltas. Touch devices: a single-finger horizontal
  // drag. Both delegate to turnReaderPage and leave vertical scrolling alone.
  const WHEEL_PAGE_THRESHOLD = 80;
  const WHEEL_NEW_GESTURE_GAP_MS = 120;
  const WHEEL_REACCEL_DELTA = 8;
  const TOUCH_PAGE_THRESHOLD = 50;
  let wheelAccumX = 0;
  let wheelLocked = false;
  let wheelDecaying = false;
  let lastWheelTime = 0;
  let lastWheelAbsX = 0;

  elements.readerText.addEventListener("wheel", (event) => {
    if (state.activeTab !== "reader") {
      return;
    }
    // Only act on horizontal-dominant gestures; vertical scrolling is untouched.
    if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) {
      return;
    }
    // Stop the browser's own back/forward swipe navigation.
    event.preventDefault();
    const absX = Math.abs(event.deltaX);
    const gap = event.timeStamp - lastWheelTime;
    // Decide whether this event starts a NEW flick rather than continuing the
    // momentum of the one that already turned a page. Two tells:
    //   1. A real pause since the last event (the trackpad went quiet), or
    //   2. Velocity rising again after it had begun to decay — a single flick's
    //      momentum only ever slows down, so a speed-up means a fresh flick.
    if (gap > WHEEL_NEW_GESTURE_GAP_MS) {
      wheelLocked = false;
      wheelAccumX = 0;
      wheelDecaying = false;
    } else if (wheelLocked) {
      if (absX < lastWheelAbsX) {
        wheelDecaying = true;
      } else if (wheelDecaying && absX > lastWheelAbsX + WHEEL_REACCEL_DELTA) {
        wheelLocked = false;
        wheelAccumX = 0;
        wheelDecaying = false;
      }
    }
    lastWheelTime = event.timeStamp;
    lastWheelAbsX = absX;
    // Ignore the remaining momentum of a flick that already turned a page, so one
    // flick never advances more than a single page.
    if (wheelLocked) {
      return;
    }
    wheelAccumX += event.deltaX;
    if (Math.abs(wheelAccumX) >= WHEEL_PAGE_THRESHOLD) {
      const direction = wheelAccumX > 0 ? "next" : "prev";
      wheelAccumX = 0;
      wheelLocked = true;
      wheelDecaying = false;
      turnReaderPage(direction);
    }
  }, { passive: false });

  let touchStartX = 0;
  let touchStartY = 0;
  let touchTracking = false;

  elements.readerText.addEventListener("touchstart", (event) => {
    // Only single-finger drags; multi-touch (e.g. pinch) is ignored.
    touchTracking = event.touches.length === 1;
    if (touchTracking) {
      touchStartX = event.touches[0].clientX;
      touchStartY = event.touches[0].clientY;
    }
  }, { passive: true });

  elements.readerText.addEventListener("touchend", (event) => {
    if (readerConvenienceMenu?.active || readerConvenienceMenu?.suppressClick) {
      touchTracking = false;
      return;
    }
    if (!touchTracking) {
      return;
    }
    touchTracking = false;
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;
    // Ignore taps and vertical-dominant drags so word selection and scrolling
    // keep working.
    if (Math.abs(deltaX) < TOUCH_PAGE_THRESHOLD || Math.abs(deltaX) <= Math.abs(deltaY)) {
      return;
    }
    // Swipe left advances; swipe right goes back.
    turnReaderPage(deltaX < 0 ? "next" : "prev");
  }, { passive: true });

  elements.readerText.addEventListener("pointerdown", (event) => {
    const button = event.target.closest("[data-token-id]");
    if (!button) {
      return;
    }
    startReaderConveniencePress(event, button);
  });

  elements.readerText.addEventListener("click", async (event) => {
    if (readerConvenienceMenu?.suppressClick) {
      event.preventDefault();
      event.stopPropagation();
      removeReaderConvenienceMenu();
      return;
    }
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

  elements.readerWordInfo.addEventListener("change", async (event) => {
    const checkbox = event.target.closest("[data-reader-practice-checkbox]");
    if (!checkbox) {
      return;
    }
    const wordId = Number(checkbox.dataset.readerWordId);
    const wantToPractice = checkbox.checked;
    if (!wordId) {
      return;
    }
    checkbox.disabled = true;
    try {
      await requestJson(`/api/words/${wordId}/want-to-practice`, {
        method: "POST",
        body: JSON.stringify({ wantToPractice })
      });
      // Keep the in-memory tokens in sync so reopening the popup is accurate.
      state.readerTokens = state.readerTokens.map((token) =>
        token.wordId === wordId ? { ...token, wantToPractice: wantToPractice ? 1 : 0 } : token
      );
      await loadDashboard();
    } catch {
      // Restore the previous state on failure so the box matches what persisted.
      checkbox.checked = !wantToPractice;
    } finally {
      checkbox.disabled = false;
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
