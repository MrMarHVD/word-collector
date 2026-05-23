import { elements } from "../dom.js";
import { formatCount, t } from "../i18n.js";
import { state } from "../state.js";
import { escapeHtml } from "../shared/html.js";

// Apply persisted reader layout dimensions through CSS custom properties.
// Render reader panel dimensions and sidebar collapsed state.
export function renderReaderSidebar() {
  elements.readerLayout.style.setProperty("--readerSidebarWidth", `${state.readerSidebarWidth}px`);
  elements.readerLayout.style.setProperty("--readerInfoWidth", `${state.readerInfoWidth}px`);
  elements.readerLayout.style.setProperty("--readerPanelWidth", state.readerPanelWidth ? `${state.readerPanelWidth}px` : "100%");
  elements.readerLayout.style.setProperty("--readerPanelHeight", state.readerPanelHeight ? `${state.readerPanelHeight}px` : "auto");
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
          return `
            <button class="material-button ${active}" type="button" data-material-id="${material.id}">
              <span>${escapeHtml(material.title)}</span>
              <small>${escapeHtml(t("reader.materialMeta", { words: formatCount(material.wordCount), type: material.fileType.toUpperCase() }))}</small>
            </button>
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

// Render details and known-toggle action for a selected reader token.
export function renderReaderWordInfo(token) {
  if (!token) {
    elements.readerWordInfo.hidden = true;
    return;
  }
  const known = Boolean(token.known);
  elements.readerWordInfo.hidden = false;
  elements.readerWordInfo.innerHTML = `
    <strong>${escapeHtml(token.surface)}</strong>
    <dl>
      <dt>${escapeHtml(t("reader.dictionaryForm"))}</dt>
      <dd>${escapeHtml(token.dictionaryForm || token.lemma)}</dd>
      <dt>${escapeHtml(t("table.translation"))}</dt>
      <dd>${escapeHtml(token.translation || t("reader.noTranslation"))}</dd>
      <dt>${escapeHtml(t("table.status"))}</dt>
      <dd>${escapeHtml(known ? t("word.known") : t("word.unknown"))}</dd>
    </dl>
    <button class="known-toggle" data-reader-word-id="${token.wordId}" data-known="${known}">${escapeHtml(known ? t("word.known") : t("word.unknown"))}</button>
    <div class="reader-word-info-resize" role="separator" aria-orientation="vertical"></div>
  `;
}
