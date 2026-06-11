import { elements } from "../dom.js";
import { normalizeStatus } from "../shared/status.js";
import { renderStatusToggle } from "./words.js";
import { formatCount, t } from "../i18n.js";
import { state } from "../state.js";
import { escapeHtml } from "../shared/html.js";

const MIN_READER_PANEL_WIDTH = 360;
const MAX_READER_SIDEBAR_WIDTH = 340;
const MAX_READER_SIDEBAR_WIDTH_SMALL = 240;
const READER_PANEL_BOTTOM_MARGIN = 16;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function readerSidebarColumnWidth() {
  if (state.readerSidebarCollapsed) {
    return 0;
  }
  const minimumWidth = window.matchMedia("(max-width: 760px)").matches ? 160 : 240;
  const maximumWidth = window.matchMedia("(max-width: 760px)").matches ? MAX_READER_SIDEBAR_WIDTH_SMALL : MAX_READER_SIDEBAR_WIDTH;
  return Math.max(minimumWidth, Math.min(state.readerSidebarWidth, maximumWidth));
}

// Apply persisted reader layout dimensions through CSS custom properties.
// Render reader panel dimensions and sidebar collapsed state.
export function renderReaderSidebar() {
  const focusMode = state.activeTab === "reader" && state.readerFocusMode;
  const mobileLayout = window.matchMedia("(max-width: 760px)").matches;
  document.body.classList.toggle("is-reader-focus", focusMode);
  const parentRect = elements.readerLayout.parentElement.getBoundingClientRect();
  const sidebarWidth = focusMode ? 0 : readerSidebarColumnWidth();
  const maxPanelWidth = Math.max(1, document.documentElement.clientWidth - sidebarWidth);
  const maxPanelHeight = focusMode
    ? Math.max(1, window.innerHeight)
    : Math.max(1, window.innerHeight - elements.readerPanel.getBoundingClientRect().top - READER_PANEL_BOTTOM_MARGIN);
  const minPanelWidth = Math.min(MIN_READER_PANEL_WIDTH, maxPanelWidth);
  const minPanelHeight = focusMode ? maxPanelHeight : Math.min(520, maxPanelHeight);
  const savedPanelWidth = focusMode ? state.readerFocusPanelWidth : state.readerPanelWidth;
  const savedPanelHeight = focusMode ? 0 : state.readerPanelHeight;
  const defaultPanelWidth = focusMode ? Math.floor(document.documentElement.clientWidth * 0.5) : maxPanelWidth;
  const panelWidth = savedPanelWidth ? clamp(savedPanelWidth, minPanelWidth, maxPanelWidth) : clamp(defaultPanelWidth, minPanelWidth, maxPanelWidth);
  const panelHeight = focusMode
    ? maxPanelHeight
    : savedPanelHeight ? clamp(savedPanelHeight, minPanelHeight, maxPanelHeight) : maxPanelHeight;
  const centeredPanelLeft = Math.max(sidebarWidth, (document.documentElement.clientWidth - panelWidth) / 2);
  const panelOffset = centeredPanelLeft - sidebarWidth;

  if (focusMode) {
    state.readerFocusPanelWidth = panelWidth;
  } else {
    state.readerPanelWidth = panelWidth;
    state.readerPanelHeight = panelHeight;
  }
  elements.readerLayout.style.setProperty("--readerViewportWidth", `${document.documentElement.clientWidth}px`);
  elements.readerLayout.style.setProperty("--readerViewportOffset", `${parentRect.left}px`);
  elements.readerLayout.style.setProperty("--readerSidebarWidth", `${sidebarWidth}px`);
  elements.readerLayout.style.setProperty("--readerInfoWidth", `${state.readerInfoWidth}px`);
  elements.readerLayout.style.setProperty("--readerPanelMinWidth", `${minPanelWidth}px`);
  elements.readerLayout.style.setProperty("--readerPanelMaxHeight", `${maxPanelHeight}px`);
  elements.readerLayout.style.setProperty("--readerPanelMinHeight", `${minPanelHeight}px`);
  elements.readerLayout.style.setProperty("--readerPanelWidth", `${panelWidth}px`);
  elements.readerLayout.style.setProperty("--readerPanelHeight", `${panelHeight}px`);
  elements.readerLayout.style.setProperty("--readerPanelOffset", `${panelOffset}px`);
  elements.readerSidebarOpen.style.setProperty("--readerSidebarOpenTop", `${elements.readerSidebar.getBoundingClientRect().top + 14}px`);
  elements.readerLayout.classList.toggle("is-sidebar-collapsed", state.readerSidebarCollapsed);
  elements.readerSidebarToggle.setAttribute("aria-expanded", String(!state.readerSidebarCollapsed));
  elements.readerSidebarOpen.hidden = focusMode || (mobileLayout && state.readerSidebarTab === "read") || !state.readerSidebarCollapsed;
  elements.readerFocusToggles.forEach((button) => {
    button.textContent = t("reader.focus");
    button.setAttribute("aria-pressed", "false");
  });
  elements.readerFocusExit.hidden = !focusMode;
  elements.readerFocusExit.setAttribute("aria-label", t("reader.exitFocus"));
}

function isWordSpacingLanguage(name) {
  if (!name) return false;
  const lower = name.toLowerCase();
  return lower === "japanese" || lower === "chinese" || name === "日本語" || name === "中文";
}

export function renderReaderSidebarTabs() {
  const mobileLayout = window.matchMedia("(max-width: 760px)").matches;
  const activeTab = state.readerSidebarTab;
  const activeSidebarPanel = activeTab === "settings" ? "settings" : "documents";
  elements.readerSidebarTabButtons.forEach((button) => {
    const active = button.dataset.readerSidebarTab === (mobileLayout ? activeTab : activeSidebarPanel);
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  elements.readerSidebarTabPanels.forEach((panel) => {
    panel.hidden = panel.dataset.readerSidebarPanel !== activeSidebarPanel;
  });
  elements.readerLayout.classList.toggle("is-reader-read-panel", mobileLayout && activeTab === "read");
  elements.readerLayout.classList.toggle("is-reader-side-panel", mobileLayout && activeTab !== "read");
  elements.readerSidebar.hidden = mobileLayout && activeTab === "read";
  elements.readerPanel.hidden = mobileLayout && activeTab !== "read";
  elements.readerAutoMarkKnown.checked = state.readerAutoMarkKnownOnPageTurn;
  elements.readerAutoMarkLearning.checked = state.readerAutoMarkLearningOnClick;
  const showSpacingToggle = isWordSpacingLanguage(state.currentMaterial?.languageName)
    || isWordSpacingLanguage(state.selectedStudyLanguageName);
  elements.readerShowWordSpacesRow.hidden = !showSpacingToggle;
  elements.readerShowWordSpaces.checked = state.readerShowWordSpaces;
  elements.readerHighlightOpacity.value = String(state.readerHighlightOpacity);
}

function importProgressDetails(material) {
  const total = Number(material?.importTotal || 0);
  const processed = Number(material?.importProcessed || 0);
  if (total > 0) {
    const percent = Math.min(100, Math.round((processed / total) * 100));
    return {
      percent,
      determinate: true,
      label: t("reader.translationProgress", { percent: String(percent) })
    };
  }
  return {
    percent: 100,
    determinate: false,
    label: t("reader.preparing")
  };
}

function materialProgressMarkup(material) {
  if (material.importStatus !== "processing") {
    return "";
  }
  const progress = importProgressDetails(material);
  return `
    <div class="material-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" ${progress.determinate ? `aria-valuenow="${progress.percent}"` : ""}>
      <div class="material-progress-track">
        <div class="material-progress-bar${progress.determinate ? "" : " animate-pulse"}" style="width:${progress.percent}%"></div>
      </div>
      <small>${escapeHtml(progress.label)}</small>
    </div>
  `;
}

// Render the imported material list and active material state.
export function renderMaterialList() {
  const searching = state.materialSearch.trim().length > 0;
  elements.materialList.innerHTML = state.materials.length
    ? state.materials
        .map((material) => {
          const active = material.id === state.selectedMaterialId ? "is-active" : "";
          const importing = material.importStatus === "processing";
          const failed = material.importStatus === "failed";
          const translating = !importing && !failed && material.translationStatus && !material.translationStatus.ready;
          const disabled = importing || failed || translating;
          const renaming = state.materialRenameId === material.id;
          let meta;
          if (importing) {
            meta = t("reader.importingMaterial");
          } else if (failed) {
            meta = material.importError || t("reader.importFailed");
          } else if (translating) {
            meta = t("reader.translatingWait");
          } else {
            meta = t("reader.materialMeta", { words: formatCount(material.wordCount), type: material.fileType.toUpperCase() });
          }
          const titleMarkup = renaming
            ? `<form class="material-title-form" data-rename-material-form="${material.id}">
                <input class="material-title-input" name="title" value="${escapeHtml(material.title)}" aria-label="${escapeHtml(t("reader.renameMaterialInput"))}" autocomplete="off" />
              </form>`
            : `<button class="material-title-button" type="button" data-material-id="${material.id}" ${disabled ? "disabled" : ""}>${escapeHtml(material.title)}</button>`;
          return `
            <div class="material-row ${active}">
              <div class="material-card">
                <div class="material-main">
                  ${titleMarkup}
                  <small>${escapeHtml(meta)}</small>
                  ${materialProgressMarkup(material)}
                </div>
                <div class="material-actions">
                  <button class="material-icon-button material-rename-button" type="button" data-rename-material-id="${material.id}" aria-label="${escapeHtml(t("reader.renameMaterial"))}" title="${escapeHtml(t("reader.renameMaterial"))}">
                    <svg aria-hidden="true" viewBox="0 0 24 24" class="material-action-icon">
                      <path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z" />
                      <path d="M13.5 6.5l4 4" />
                    </svg>
                  </button>
                  <button class="material-icon-button material-delete-button" type="button" data-delete-material-id="${material.id}" aria-label="${escapeHtml(t("reader.deleteMaterial"))}" title="${escapeHtml(t("reader.deleteMaterial"))}">
                    <svg aria-hidden="true" viewBox="0 0 24 24" class="material-action-icon">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          `;
        })
        .join("")
    : `<p class="empty">${escapeHtml(t(searching ? "reader.noSearchMatches" : "reader.noMaterials"))}</p>`;
}

// Show import progress for the work currently being imported. The worker
// translates each token into the user's native language as it persists it, so
// processed/total tokens measures the time until the work can be opened.
// Clears itself once the tracked work is ready.
export function renderImportProgress() {
  const tracked = state.importingMaterialId
    ? state.materials.find((material) => material.id === state.importingMaterialId)
    : null;
  const importing = tracked?.importStatus === "processing";
  const failed = tracked?.importStatus === "failed";

  // The tracked work finished importing (or vanished from the list): stop
  // tracking it so the bar hides once the reader opens.
  if (state.importingMaterialId && tracked && !importing && !failed) {
    state.importingMaterialId = null;
  }

  const active = state.importInProgress || importing || failed;
  elements.materialImportProgress.hidden = !active;
  if (!active) {
    return;
  }

  if (failed) {
    elements.materialImportProgressBar.classList.remove("animate-pulse");
    elements.materialImportProgressBar.style.width = "100%";
    elements.materialImportProgress.removeAttribute("aria-valuenow");
    elements.materialImportProgressLabel.textContent = tracked.importError || t("reader.importFailed");
    return;
  }

  if (importing) {
    const progress = importProgressDetails(tracked);
    elements.materialImportProgressBar.classList.remove("animate-pulse");
    elements.materialImportProgressBar.style.width = `${progress.percent}%`;
    elements.materialImportProgressLabel.textContent = progress.label;
    if (progress.determinate) {
      elements.materialImportProgress.setAttribute("aria-valuenow", String(progress.percent));
      return;
    }
    elements.materialImportProgressBar.classList.add("animate-pulse");
    elements.materialImportProgress.removeAttribute("aria-valuenow");
    return;
  }

  // Extraction and tokenization happen before the material row exists.
  elements.materialImportProgressBar.classList.add("animate-pulse");
  elements.materialImportProgressBar.style.width = "100%";
  elements.materialImportProgress.removeAttribute("aria-valuenow");
  elements.materialImportProgressLabel.textContent = t("reader.preparing");
}

function tokenButtonMarkup(token) {
  const status = token.status || (token.known ? "known" : "unknown");
  return `<button class="reader-token" type="button" data-word-id="${token.wordId}" data-token-id="${token.id}" data-status="${status}">${escapeHtml(token.surface)}</button>`;
}

// Render one token with its literal surrounding text. Falls back to the
// supplied separator when leading/trailing fields are absent (legacy tokens).
function tokenWithGaps(token, fallbackSeparator, isFirstInGroup, showSpacesForCjk) {
  const hasGaps = token.leadingText !== null && token.leadingText !== undefined
    && token.trailingText !== null && token.trailingText !== undefined;
  if (!hasGaps) {
    return (isFirstInGroup ? "" : fallbackSeparator) + tokenButtonMarkup(token);
  }
  const lead = isFirstInGroup ? escapeHtml(token.leadingText) : "";
  let trail = escapeHtml(token.trailingText);
  // When the CJK "show word spaces" toggle is on, inject a single space
  // wherever there is no other literal text between adjacent tokens.
  if (showSpacesForCjk && !token.trailingText) trail = " ";
  return lead + tokenButtonMarkup(token) + trail;
}

const BLOCK_WRAPPERS = {
  "heading-1": { tag: "h1", className: "reader-block reader-heading reader-heading-1" },
  "heading-2": { tag: "h2", className: "reader-block reader-heading reader-heading-2" },
  "heading-3": { tag: "h3", className: "reader-block reader-heading reader-heading-3" },
  "heading-4": { tag: "h4", className: "reader-block reader-heading reader-heading-4" },
  "heading-5": { tag: "h5", className: "reader-block reader-heading reader-heading-5" },
  "heading-6": { tag: "h6", className: "reader-block reader-heading reader-heading-6" },
  paragraph: { tag: "p", className: "reader-block reader-paragraph" },
  blockquote: { tag: "blockquote", className: "reader-block reader-blockquote" },
  "list-item": { tag: "li", className: "reader-block reader-list-item" }
};

function wrapperFor(blockType) {
  return BLOCK_WRAPPERS[blockType] || BLOCK_WRAPPERS.paragraph;
}

// Render the page either as a flat sequence (legacy materials, PDF, TXT) or as
// block-wrapped groups when structured EPUB tokens are present.
function renderReaderTokenMarkup(tokens, languageName) {
  if (!tokens.length) return "";
  const cjk = isWordSpacingLanguage(languageName);
  const fallbackSeparator = cjk && !state.readerShowWordSpaces ? "" : " ";
  const showSpacesForCjk = cjk && state.readerShowWordSpaces;
  if (tokens[0].blockIndex === null || tokens[0].blockIndex === undefined) {
    return tokens
      .map((token, index) => tokenWithGaps(token, cjk ? fallbackSeparator : "", index === 0, showSpacesForCjk))
      .join("");
  }

  const groups = [];
  let current = null;
  for (const token of tokens) {
    if (!current || token.blockIndex !== current.blockIndex) {
      current = { blockIndex: token.blockIndex, blockType: token.blockType, tokens: [] };
      groups.push(current);
    }
    current.tokens.push(token);
  }

  const parts = [];
  let inList = false;
  for (const group of groups) {
    const isListItem = group.blockType === "list-item";
    if (isListItem && !inList) {
      parts.push(`<ul class="reader-list">`);
      inList = true;
    } else if (!isListItem && inList) {
      parts.push(`</ul>`);
      inList = false;
    }
    const wrapper = wrapperFor(group.blockType);
    const inner = group.tokens
      .map((token, index) => tokenWithGaps(token, fallbackSeparator, index === 0, showSpacesForCjk))
      .join("");
    parts.push(`<${wrapper.tag} class="${wrapper.className}">${inner}</${wrapper.tag}>`);
  }
  if (inList) parts.push(`</ul>`);
  return parts.join("");
}

function renderReaderPagination(material) {
  const end = Math.min(state.readerStart + state.readerTokens.length, material?.wordCount || 0);
  elements.readerPageStatus.textContent = material
    ? t("reader.pageStatus", { start: formatCount(state.readerStart + 1), end: formatCount(end), total: formatCount(material.wordCount) })
    : "";
  elements.readerPrevPage.disabled = state.readerStart <= 0;
  elements.readerNextPage.disabled = !material || end >= material.wordCount;
}

// Render the current reader token page and pagination controls.
export function renderReaderTokens() {
  // Reader pages are rendered as token buttons so each word can expose details.
  elements.readerText.style.setProperty("--readerFontSize", `${state.readerFontSize}px`);
  elements.readerText.style.setProperty("--readerHighlightOpacity", String(state.readerHighlightOpacity));
  elements.readerFontSize.value = String(state.readerFontSize);
  elements.readerWordsPerPage.value = String(state.readerWordsPerPage);

  if (!state.selectedMaterialId) {
    elements.readerTitle.textContent = t("reader.title");
    elements.readerMeta.textContent = "";
    elements.readerText.innerHTML = `<p class="empty">${escapeHtml(t("reader.selectMaterial"))}</p>`;
    elements.readerPageStatus.textContent = "";
    elements.readerPrevPage.disabled = true;
    elements.readerNextPage.disabled = true;
    elements.readerWordInfo.hidden = true;
    return;
  }

  if (state.currentMaterial?.translationStatus && !state.currentMaterial.translationStatus.ready) {
    elements.readerTitle.textContent = state.currentMaterial.title || t("reader.title");
    elements.readerMeta.textContent = "";
    elements.readerText.innerHTML = `<p class="empty">${escapeHtml(t("reader.translatingWait"))}</p>`;
    elements.readerPageStatus.textContent = "";
    elements.readerPrevPage.disabled = true;
    elements.readerNextPage.disabled = true;
    elements.readerWordInfo.hidden = true;
    return;
  }

  const material = state.currentMaterial;
  elements.readerTitle.textContent = material?.title || t("reader.title");
  elements.readerMeta.textContent = material ? t("reader.readerMeta", { words: formatCount(material.wordCount), language: material.languageName }) : "";
  elements.readerText.innerHTML = renderReaderTokenMarkup(state.readerTokens, material?.languageName);
  renderReaderPagination(material);
}

export function fitReaderTokensToPage(tokens = state.readerFetchedTokens) {
  const material = state.currentMaterial;
  if (state.readerWordsPerPage !== "fit" || !material?.translationStatus?.ready || !tokens.length) {
    return;
  }
  let low = 1;
  let high = tokens.length;
  let best = 1;
  const fits = (count) => {
    elements.readerText.innerHTML = renderReaderTokenMarkup(tokens.slice(0, count), material.languageName);
    return elements.readerText.scrollHeight <= elements.readerText.clientHeight + 1;
  };
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (fits(mid)) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  state.readerTokens = tokens.slice(0, best);
  elements.readerText.innerHTML = renderReaderTokenMarkup(state.readerTokens, material.languageName);
  elements.readerText.scrollTop = 0;
  renderReaderPagination(material);
}

function positionReaderWordInfo(anchor) {
  if (!anchor) {
    return;
  }
  const gap = 10;
  const margin = 12;
  const mobileFocus = document.body.classList.contains("is-reader-focus") && window.matchMedia("(max-width: 760px)").matches;
  const bottomReserved = mobileFocus ? 86 : margin;
  const anchorRect = anchor.getBoundingClientRect();
  const infoRect = elements.readerWordInfo.getBoundingClientRect();
  const rightLeft = anchorRect.right + gap;
  const leftLeft = anchorRect.left - infoRect.width - gap;
  const left = rightLeft + infoRect.width <= window.innerWidth - margin ? rightLeft : Math.max(margin, leftLeft);
  const top = Math.min(Math.max(margin, anchorRect.top + anchorRect.height / 2 - infoRect.height / 2), window.innerHeight - infoRect.height - bottomReserved);

  elements.readerWordInfo.style.setProperty("--readerInfoLeft", `${left}px`);
  elements.readerWordInfo.style.setProperty("--readerInfoTop", `${top}px`);
  elements.readerWordInfo.style.visibility = "";
}

function renderDisambiguationTable(candidates) {
  if (!Array.isArray(candidates) || candidates.length <= 1) {
    return "";
  }
  return `
    <div class="disambiguation-panel" data-disambiguation-panel hidden>
      <table>
        <thead>
          <tr>
            <th>${escapeHtml(t("table.word"))}</th>
            <th>${escapeHtml(t("table.translation"))}</th>
            <th>${escapeHtml(t("reader.partOfSpeech"))}</th>
          </tr>
        </thead>
        <tbody>
          ${candidates.map((candidate) => {
            const pos = candidate.pos ? t(`pos.${candidate.pos}`, {}, candidate.pos) : "";
            return `
              <tr>
                <td>${escapeHtml(candidate.source || "")}</td>
                <td>${escapeHtml(candidate.translation || "")}</td>
                <td>${escapeHtml(pos)}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

// Render details and status actions for a selected reader token.
export function renderReaderWordInfo(token, anchor = null) {
  if (!token) {
    elements.readerWordInfo.hidden = true;
    elements.readerWordInfo.style.visibility = "";
    return;
  }
  const status = normalizeStatus(token.status || (token.known ? "known" : "unknown"));
  const rows = [];
  const dictionaryForm = token.dictionaryForm || token.lemma;
  const subcategoryKey = token.posSubcategory;
  const subcategoryLabel = subcategoryKey ? t(`pos.${subcategoryKey}`, {}, subcategoryKey) : "";
  const subcategorySuffix = subcategoryLabel ? ` (${subcategoryLabel})` : "";
  rows.push({ label: t("reader.dictionaryForm"), value: `${dictionaryForm}${subcategorySuffix}` });
  rows.push({ label: t("table.translation"), value: token.translation || t("reader.noTranslation") });
  if (token.reading && token.reading !== dictionaryForm) {
    rows.push({ label: t("reader.reading"), value: token.reading });
  }
  if (token.pinyin) {
    rows.push({ label: t("reader.pinyin"), value: token.pinyin });
  }
  if (token.traditional && token.traditional !== dictionaryForm) {
    rows.push({ label: t("reader.traditional"), value: token.traditional });
  }
  const posKey = token.posSubcategory || token.wordPos;
  const posLabel = posKey ? t(`pos.${posKey}`, {}, posKey) : "";
  const conjKey = token.conjugationForm;
  const conjLabel = conjKey ? t(`conjugation.${conjKey}`, {}, conjKey) : "";
  const posLabelParts = [posLabel, conjLabel].filter(Boolean);
  if (posLabelParts.length) {
    rows.push({ label: t("reader.partOfSpeech"), value: posLabelParts.join(" · ") });
  }
  rows.push({ label: t("table.status"), value: t(`word.${status}`) });

  elements.readerWordInfo.hidden = false;
  elements.readerWordInfo.style.visibility = "hidden";
  elements.readerWordInfo.innerHTML = `
    <div class="reader-word-info-head">
      <strong>${escapeHtml(token.surface)}</strong>
      ${(token.disambiguationCandidates || []).length > 1 ? `<button class="disambiguation-button secondary-button rounded-md border border-line bg-panel px-3 text-sm font-bold text-brand hover:bg-hover" type="button" data-disambiguate aria-expanded="false">
        <span class="disambiguation-button-icon" aria-hidden="true">▾</span>
        <span>${escapeHtml(t("reader.disambiguate"))}</span>
      </button>` : ""}
      <button class="reader-word-info-close" type="button" data-reader-word-info-close aria-label="${escapeHtml(t("reader.closeTranslation"))}">&times;</button>
    </div>
    <dl>
      ${rows.map((row) => `<dt>${escapeHtml(row.label)}</dt><dd>${escapeHtml(row.value)}</dd>`).join("")}
    </dl>
    ${renderStatusToggle(token.wordId, status, { dataAttr: "data-reader-word-id" })}
    ${renderDisambiguationTable(token.disambiguationCandidates)}
  `;
  positionReaderWordInfo(anchor);
}
