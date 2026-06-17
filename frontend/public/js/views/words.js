/**
 * @fileoverview Words (vocabulary table) view — renders the collection word
 * table with drag handles, phonetic and POS badges, translation-override
 * controls, disambiguation expansion rows, and a three-segment status toggle
 * per row. Supports both paged and infinite-scroll display modes driven by
 * `state.wordDisplayMode`.
 */

import { elements } from "../dom.js";
import { state, WORD_PAGE_SIZE, WORDS_PER_PAGE } from "../state.js";
import { formatCount, t } from "../i18n.js";
import { escapeHtml } from "../shared/html.js";
import { normalizeStatus, WORD_STATUSES } from "../shared/status.js";
import { renderDisplayModeButtons } from "./shell.js";
import { renderTranslationOverrideControls } from "./components/translation-override.js";
import { hasDisambiguation, renderDisambiguationTable } from "./components/disambiguation.js";

function usePagedWordList() {
  return state.wordDisplayMode === "page";
}

/**
 * Returns the HTML string for a three-segment status toggle (unknown /
 * learning / known) for a single word. The currently active segment is
 * indicated with `data-active="true"` and `aria-pressed="true"`.
 *
 * Used both inside the vocabulary table rows and in the reader word-info popup.
 *
 * @param {number|string} wordId - The word identifier, written into the
 *   container element via `dataAttr`.
 * @param {string} currentStatus - The word's current status string. Normalised
 *   via `normalizeStatus` before comparison.
 * @param {{ dataAttr?: string }} [options] - Optional configuration.
 * @param {string} [options.dataAttr="data-word-id"] - The `data-*` attribute
 *   name to place on the toggle container, used by event handlers to resolve
 *   the word ID.
 *
 * @returns {string} An HTML string for the status toggle `<div>`.
 */
export function renderStatusToggle(wordId, currentStatus, { dataAttr = "data-word-id" } = {}) {
  const active = normalizeStatus(currentStatus);
  const segments = WORD_STATUSES
    .map((status) => {
      const isActive = status === active;
      return `<button class="status-segment" type="button" data-status="${status}" data-active="${isActive}" aria-pressed="${isActive}">${escapeHtml(t(`word.${status}`))}</button>`;
    })
    .join("");
  return `<div class="status-toggle" role="group" ${dataAttr}="${wordId}">${segments}</div>`;
}

/**
 * Renders the expanded disambiguation row for a word, wrapping the shared
 * disambiguation table in a full-width table row. Returns an empty string
 * unless this word is the currently expanded one and it has entries to show.
 *
 * @param {object} entry - The vocabulary word entry.
 * @returns {string} The expansion row HTML string, or an empty string.
 */
function renderDisambiguationRows(entry) {
  if (state.expandedDisambiguationWordId !== entry.id) {
    return "";
  }
  const table = renderDisambiguationTable(entry, { className: "disambiguation-table" });
  if (!table) {
    return "";
  }
  return `
    <tr class="disambiguation-row" data-disambiguation-for="${entry.id}">
      <td></td>
      <td colspan="4">${table}</td>
    </tr>
  `;
}

/**
 * Renders the collection word table. Switches between paged mode
 * (`state.wordDisplayMode === "page"`) and infinite-scroll windowed mode
 * based on `state.wordDisplayMode` and `state.visibleWordCount`.
 *
 * Each row includes a drag handle, the word with phonetic annotations and POS
 * badges, the translation-override cell, an optional disambiguation button,
 * and the status toggle. An expansion row with a disambiguation candidate table
 * is injected immediately below the row when
 * `state.expandedDisambiguationWordId` matches.
 *
 * Shows the empty state when `words` is empty: either a no-search-results
 * message (when collections exist) or the first-use empty prompt.
 *
 * In paged mode, shows or hides `elements.wordPagination` with page-counter
 * text and disabled states for the prev/next buttons.
 *
 * @param {Array<object>} words - The full filtered word list to render.
 *
 * @sideeffects
 * - Calls {@link renderDisplayModeButtons}.
 * - Mutates `state.wordsPage` when the current page index exceeds the total.
 * - Replaces `elements.wordRows.innerHTML`.
 * - Sets `elements.tableWrap.classList` scroll hint.
 * - Shows or hides `elements.emptyState`, updates its text.
 * - Shows or hides `elements.wordPagination`; updates
 *   `elements.wordPageStatus`, `elements.wordPrevPage.disabled`, and
 *   `elements.wordNextPage.disabled` in paged mode.
 */
export function renderWords(words) {
  renderDisplayModeButtons();
  const pageMode = usePagedWordList();
  const scrollableInfiniteMode = !pageMode && words.length > 5;
  const totalPages = pageMode ? Math.max(1, Math.ceil(words.length / WORDS_PER_PAGE)) : 1;
  if (pageMode && state.wordsPage >= totalPages) {
    state.wordsPage = totalPages - 1;
  }
  if (state.wordsPage < 0) {
    state.wordsPage = 0;
  }
  const visibleWords = pageMode
    ? words.slice(state.wordsPage * WORDS_PER_PAGE, (state.wordsPage + 1) * WORDS_PER_PAGE)
    : words.slice(0, state.visibleWordCount);
  elements.tableWrap.classList.toggle("is-scrollable", scrollableInfiniteMode);

  elements.wordRows.innerHTML = visibleWords
    .map(
      (entry) => {
        const badges = [];
        const posKey = entry.posSubcategory || entry.pos;
        if (posKey) badges.push(t(`pos.${posKey}`, {}, posKey));
        const phonetics = [];
        if (entry.reading) phonetics.push(entry.reading);
        if (entry.pinyin) phonetics.push(entry.pinyin);
        if (entry.traditional && entry.traditional !== entry.word) phonetics.push(entry.traditional);
        const selected = state.selectedWordIds.has(entry.id);
        const showDisambiguation = hasDisambiguation(entry);
        const expanded = state.expandedDisambiguationWordId === entry.id;
        return `
      <tr class="word-row${selected ? " is-selected" : ""}" draggable="true" data-word-id="${entry.id}" data-collection-id="${entry.collectionId}" aria-selected="${selected}">
        <td class="word-drag-cell px-2 py-3 align-middle" data-label="${escapeHtml(t("collections.collection"))}">
          <span class="word-drag-handle" aria-label="${escapeHtml(t("collections.dragHandle"))}" title="${escapeHtml(t("collections.dragHandle"))}">
            <svg aria-hidden="true" viewBox="0 0 16 16" class="h-4 w-4 fill-current">
              <circle cx="5" cy="3" r="1.4"/><circle cx="11" cy="3" r="1.4"/>
              <circle cx="5" cy="8" r="1.4"/><circle cx="11" cy="8" r="1.4"/>
              <circle cx="5" cy="13" r="1.4"/><circle cx="11" cy="13" r="1.4"/>
            </svg>
          </span>
        </td>
        <td class="px-3 py-3 align-top" data-label="${escapeHtml(t("table.word"))}">
          <div class="word-cell">
            <span class="word-cell-main">${escapeHtml(entry.word)}</span>
            ${phonetics.length ? `<span class="word-cell-phonetic">${escapeHtml(phonetics.join(" · "))}</span>` : ""}
            ${badges.length ? `<span class="word-cell-badges">${badges.map((badge) => `<span class="word-badge">${escapeHtml(badge)}</span>`).join("")}</span>` : ""}
          </div>
        </td>
        <td class="px-3 py-3 align-top text-label" data-label="${escapeHtml(t("table.translation"))}">
          ${renderTranslationOverrideControls(entry, { context: "vocab" })}
        </td>
        <td class="px-3 py-3 align-middle word-action-cell" data-label="${escapeHtml(t("reader.disambiguate"))}">
          ${showDisambiguation ? `<button class="disambiguation-button secondary-button rounded-md border border-line bg-panel px-3 text-sm font-bold text-brand hover:bg-hover" type="button" data-word-disambiguate="${entry.id}" aria-expanded="${expanded}">
            <span class="disambiguation-button-icon" aria-hidden="true">▾</span>
            <span>${escapeHtml(t("reader.disambiguate"))}</span>
          </button>` : ""}
        </td>
        <td class="status-cell" data-label="${escapeHtml(t("table.status"))}">
          ${renderStatusToggle(entry.id, entry.status)}
        </td>
      </tr>
      ${renderDisambiguationRows(entry)}
    `;
      }
    )
    .join("");

  const hasCollections = (state.dashboard.allCollections || state.dashboard.collections).length > 0;
  elements.emptyState.hidden = words.length > 0 || hasCollections;

  if (pageMode && words.length) {
    elements.wordPagination.hidden = false;
    elements.wordPageStatus.textContent = t("collections.pageStatus", {
      current: formatCount(state.wordsPage + 1),
      total: formatCount(totalPages)
    });
    elements.wordPrevPage.disabled = state.wordsPage <= 0;
    elements.wordNextPage.disabled = state.wordsPage >= totalPages - 1;
  } else {
    elements.wordPagination.hidden = true;
  }

  if (!words.length && hasCollections) {
    elements.emptyState.hidden = false;
    elements.emptyState.textContent = t("collections.noSearchResults");
  } else {
    elements.emptyState.textContent = t("collections.empty");
  }
}

/**
 * Appends the next batch of words to the visible window when the user scrolls
 * close to the bottom of the word table in infinite-scroll mode. Does nothing
 * in paged mode or when all words are already visible.
 *
 * Triggers when the remaining scrollable distance in `elements.tableWrap` is
 * ≤ 120 px.
 *
 * @sideeffects
 * - Increments `state.visibleWordCount` by `WORD_PAGE_SIZE`, capped at
 *   `state.words.length`.
 * - Calls {@link renderWords} with `state.words` to update the DOM.
 */
export function loadMoreWordsIfNeeded() {
  if (usePagedWordList() || state.visibleWordCount >= state.words.length) {
    return;
  }

  const remainingScroll = elements.tableWrap.scrollHeight - elements.tableWrap.scrollTop - elements.tableWrap.clientHeight;
  if (remainingScroll > 120) {
    return;
  }

  state.visibleWordCount = Math.min(state.visibleWordCount + WORD_PAGE_SIZE, state.words.length);
  renderWords(state.words);
}
