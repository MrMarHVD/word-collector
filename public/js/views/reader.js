import { elements } from "../dom.js";
import { formatCount, t } from "../i18n.js";
import { state } from "../state.js";
import { escapeHtml } from "../shared/html.js";

const MIN_READER_PANEL_WIDTH = 360;
const MIN_READER_PANEL_HEIGHT = 520;
const READER_PANEL_BOTTOM_MARGIN = 16;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function readerSidebarColumnWidth() {
  if (state.readerSidebarCollapsed) {
    return 0;
  }
  const viewportWidth = window.innerWidth;
  const minimumWidth = window.matchMedia("(max-width: 760px)").matches ? 160 : 240;
  const maximumWidth = viewportWidth * (window.matchMedia("(max-width: 760px)").matches ? 0.46 : 0.55);
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

  state.readerPanelWidth = panelWidth;
  state.readerPanelHeight = panelHeight;
  elements.readerLayout.style.setProperty("--readerViewportWidth", `${document.documentElement.clientWidth}px`);
  elements.readerLayout.style.setProperty("--readerViewportOffset", `${parentRect.left}px`);
  elements.readerLayout.style.setProperty("--readerSidebarWidth", `${state.readerSidebarWidth}px`);
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

// Render the imported material list and active material state.
export function renderMaterialList() {
  elements.materialList.innerHTML = state.materials.length
    ? state.materials
        .map((material) => {
          const active = material.id === state.selectedMaterialId ? "is-active" : "";
          const translating = material.translationStatus && !material.translationStatus.ready;
          return `
            <div class="material-row ${active}">
              <button class="material-button rounded-lg border border-line bg-white p-2.5 text-left hover:bg-teal-50" type="button" data-material-id="${material.id}" ${translating ? "disabled" : ""}>
                <span>${escapeHtml(material.title)}</span>
                <small>${escapeHtml(translating ? t("reader.translatingWait") : t("reader.materialMeta", { words: formatCount(material.wordCount), type: material.fileType.toUpperCase() }))}</small>
              </button>
              <button class="material-delete-button rounded-lg border border-red-200 bg-white px-2.5 text-sm font-bold text-red-700 hover:bg-red-50" type="button" data-delete-material-id="${material.id}" aria-label="${escapeHtml(t("reader.deleteMaterial"))}">
                ${escapeHtml(t("reader.deleteMaterial"))}
              </button>
            </div>
          `;
        })
        .join("")
    : `<p class="empty">${escapeHtml(t("reader.noMaterials"))}</p>`;
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
  elements.readerText.innerHTML = state.readerTokens
    .map(
      (token) => `<button class="reader-token" type="button" data-word-id="${token.wordId}" data-token-id="${token.id}" data-known="${Boolean(token.known)}">${escapeHtml(token.surface)}</button>`
    )
    .join("");

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
  elements.readerWordInfo.hidden = false;
  elements.readerWordInfo.style.visibility = "hidden";
  elements.readerWordInfo.innerHTML = `
    <div class="reader-word-info-head">
      <strong>${escapeHtml(token.surface)}</strong>
      <button class="reader-word-info-close" type="button" data-reader-word-info-close aria-label="${escapeHtml(t("reader.closeTranslation"))}">&times;</button>
    </div>
    <dl>
      <dt>${escapeHtml(t("reader.dictionaryForm"))}</dt>
      <dd>${escapeHtml(token.dictionaryForm || token.lemma)}</dd>
      <dt>${escapeHtml(t("table.translation"))}</dt>
      <dd>${escapeHtml(token.translation || t("reader.noTranslation"))}</dd>
      <dt>${escapeHtml(t("table.status"))}</dt>
      <dd>${escapeHtml(known ? t("word.known") : t("word.unknown"))}</dd>
    </dl>
    <button class="known-toggle" data-reader-word-id="${token.wordId}" data-known="${known}">${escapeHtml(known ? t("word.known") : t("word.unknown"))}</button>
  `;
  positionReaderWordInfo(anchor);
}
