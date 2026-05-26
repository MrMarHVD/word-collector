import { elements } from "../dom.js";
import { formatCount, t } from "../i18n.js";
import { state } from "../state.js";
import { escapeHtml } from "../shared/html.js";

const MIN_READER_PANEL_WIDTH = 360;
const MIN_READER_PANEL_HEIGHT = 520;
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
  const parentRect = elements.readerLayout.parentElement.getBoundingClientRect();
  const maxPanelWidth = Math.max(1, document.documentElement.clientWidth - readerSidebarColumnWidth());
  const maxPanelHeight = Math.max(1, window.innerHeight - elements.readerPanel.getBoundingClientRect().top - READER_PANEL_BOTTOM_MARGIN);
  const minPanelWidth = Math.min(MIN_READER_PANEL_WIDTH, maxPanelWidth);
  const minPanelHeight = Math.min(MIN_READER_PANEL_HEIGHT, maxPanelHeight);
  const panelWidth = state.readerPanelWidth ? clamp(state.readerPanelWidth, minPanelWidth, maxPanelWidth) : maxPanelWidth;
  const panelHeight = state.readerPanelHeight ? clamp(state.readerPanelHeight, minPanelHeight, maxPanelHeight) : clamp(620, minPanelHeight, maxPanelHeight);
  const sidebarWidth = readerSidebarColumnWidth();

  state.readerPanelWidth = panelWidth;
  state.readerPanelHeight = panelHeight;
  elements.readerLayout.style.setProperty("--readerViewportWidth", `${document.documentElement.clientWidth}px`);
  elements.readerLayout.style.setProperty("--readerViewportOffset", `${parentRect.left}px`);
  elements.readerLayout.style.setProperty("--readerSidebarWidth", `${sidebarWidth}px`);
  elements.readerLayout.style.setProperty("--readerInfoWidth", `${state.readerInfoWidth}px`);
  elements.readerLayout.style.setProperty("--readerPanelMinWidth", `${minPanelWidth}px`);
  elements.readerLayout.style.setProperty("--readerPanelMaxHeight", `${maxPanelHeight}px`);
  elements.readerLayout.style.setProperty("--readerPanelMinHeight", `${minPanelHeight}px`);
  elements.readerLayout.style.setProperty("--readerPanelWidth", `${panelWidth}px`);
  elements.readerLayout.style.setProperty("--readerPanelHeight", `${panelHeight}px`);
  elements.readerLayout.classList.toggle("is-sidebar-collapsed", state.readerSidebarCollapsed);
  elements.readerSidebarToggle.setAttribute("aria-expanded", String(!state.readerSidebarCollapsed));
  elements.readerSidebarOpen.hidden = !state.readerSidebarCollapsed;
}

export function renderReaderSidebarTabs() {
  elements.readerSidebarTabButtons.forEach((button) => {
    const active = button.dataset.readerSidebarTab === state.readerSidebarTab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  elements.readerSidebarTabPanels.forEach((panel) => {
    panel.hidden = panel.dataset.readerSidebarPanel !== state.readerSidebarTab;
  });
  elements.readerAutoMarkKnown.checked = state.readerAutoMarkKnownOnPageTurn;
}

// Render the imported material list and active material state.
export function renderMaterialList() {
  elements.materialList.innerHTML = state.materials.length
    ? state.materials
        .map((material) => {
          const active = material.id === state.selectedMaterialId ? "is-active" : "";
          const translating = material.translationStatus && !material.translationStatus.ready;
          return `
            <div class="material-row ${active}">
              <button class="material-button rounded-lg border border-line bg-panel p-2.5 text-left hover:bg-hover" type="button" data-material-id="${material.id}" ${translating ? "disabled" : ""}>
                <span>${escapeHtml(material.title)}</span>
                <small>${escapeHtml(translating ? t("reader.translatingWait") : t("reader.materialMeta", { words: formatCount(material.wordCount), type: material.fileType.toUpperCase() }))}</small>
              </button>
              <button class="material-delete-button rounded-lg border px-2.5 text-sm font-bold" type="button" data-delete-material-id="${material.id}" aria-label="${escapeHtml(t("reader.deleteMaterial"))}">
                ${escapeHtml(t("reader.deleteMaterial"))}
              </button>
            </div>
          `;
        })
        .join("")
    : `<p class="empty">${escapeHtml(t("reader.noMaterials"))}</p>`;
}

function tokenButtonMarkup(token) {
  return `<button class="reader-token" type="button" data-word-id="${token.wordId}" data-token-id="${token.id}" data-known="${Boolean(token.known)}">${escapeHtml(token.surface)}</button>`;
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
function renderReaderTokenMarkup(tokens) {
  if (!tokens.length) return "";
  if (tokens[0].blockIndex === null || tokens[0].blockIndex === undefined) {
    return tokens.map(tokenButtonMarkup).join("");
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
    const inner = group.tokens.map(tokenButtonMarkup).join(" ");
    parts.push(`<${wrapper.tag} class="${wrapper.className}">${inner}</${wrapper.tag}>`);
  }
  if (inList) parts.push(`</ul>`);
  return parts.join("");
}

// Render the current reader token page and pagination controls.
export function renderReaderTokens() {
  // Reader pages are rendered as token buttons so each word can expose details.
  elements.readerText.style.setProperty("--readerFontSize", `${state.readerFontSize}px`);
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
  elements.readerText.innerHTML = renderReaderTokenMarkup(state.readerTokens);

  const end = Math.min(state.readerStart + state.readerTokens.length, material?.wordCount || 0);
  elements.readerPageStatus.textContent = material
    ? t("reader.pageStatus", { start: formatCount(state.readerStart + 1), end: formatCount(end), total: formatCount(material.wordCount) })
    : "";
  elements.readerPrevPage.disabled = state.readerStart <= 0;
  elements.readerNextPage.disabled = !material || end >= material.wordCount;
}

function positionReaderWordInfo(anchor) {
  if (!anchor) {
    return;
  }
  const gap = 10;
  const margin = 12;
  const anchorRect = anchor.getBoundingClientRect();
  const infoRect = elements.readerWordInfo.getBoundingClientRect();
  const rightLeft = anchorRect.right + gap;
  const leftLeft = anchorRect.left - infoRect.width - gap;
  const left = rightLeft + infoRect.width <= window.innerWidth - margin ? rightLeft : Math.max(margin, leftLeft);
  const top = Math.min(Math.max(margin, anchorRect.top + anchorRect.height / 2 - infoRect.height / 2), window.innerHeight - infoRect.height - margin);

  elements.readerWordInfo.style.setProperty("--readerInfoLeft", `${left}px`);
  elements.readerWordInfo.style.setProperty("--readerInfoTop", `${top}px`);
  elements.readerWordInfo.style.visibility = "";
}

// Render details and known-toggle action for a selected reader token.
export function renderReaderWordInfo(token, anchor = null) {
  if (!token) {
    elements.readerWordInfo.hidden = true;
    elements.readerWordInfo.style.visibility = "";
    return;
  }
  const known = Boolean(token.known);
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
  rows.push({ label: t("table.status"), value: known ? t("word.known") : t("word.unknown") });

  elements.readerWordInfo.hidden = false;
  elements.readerWordInfo.style.visibility = "hidden";
  elements.readerWordInfo.innerHTML = `
    <div class="reader-word-info-head">
      <strong>${escapeHtml(token.surface)}</strong>
      <button class="reader-word-info-close" type="button" data-reader-word-info-close aria-label="${escapeHtml(t("reader.closeTranslation"))}">&times;</button>
    </div>
    <dl>
      ${rows.map((row) => `<dt>${escapeHtml(row.label)}</dt><dd>${escapeHtml(row.value)}</dd>`).join("")}
    </dl>
    <button class="known-toggle" data-reader-word-id="${token.wordId}" data-known="${known}">${escapeHtml(known ? t("word.known") : t("word.unknown"))}</button>
  `;
  positionReaderWordInfo(anchor);
}
