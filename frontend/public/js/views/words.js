import { elements } from "../dom.js";
import { state, WORD_PAGE_SIZE, WORDS_PER_PAGE } from "../state.js";
import { formatCount, t } from "../i18n.js";
import { escapeHtml } from "../shared/html.js";
import { renderDisplayModeButtons } from "./shell.js";

// Render either the paged view or a windowed list for infinite scrolling.
// Render collection word rows, empty states, and pagination controls.
export function renderWords(words) {
  renderDisplayModeButtons();
  const pageMode = state.wordDisplayMode === "page";
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
  elements.tableWrap.classList.toggle("is-scrollable", !pageMode && words.length > WORD_PAGE_SIZE);

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
        return `
      <tr class="word-row${selected ? " is-selected" : ""}" draggable="true" data-word-id="${entry.id}" data-collection-id="${entry.collectionId}" aria-selected="${selected}">
        <td class="word-drag-cell px-2 py-3 align-middle">
          <span class="word-drag-handle" aria-label="${escapeHtml(t("collections.dragHandle"))}" title="${escapeHtml(t("collections.dragHandle"))}">
            <svg aria-hidden="true" viewBox="0 0 16 16" class="h-4 w-4 fill-current">
              <circle cx="5" cy="3" r="1.4"/><circle cx="11" cy="3" r="1.4"/>
              <circle cx="5" cy="8" r="1.4"/><circle cx="11" cy="8" r="1.4"/>
              <circle cx="5" cy="13" r="1.4"/><circle cx="11" cy="13" r="1.4"/>
            </svg>
          </span>
        </td>
        <td class="px-3 py-3 align-top">
          <div class="word-cell">
            <span class="word-cell-main">${escapeHtml(entry.word)}</span>
            ${phonetics.length ? `<span class="word-cell-phonetic">${escapeHtml(phonetics.join(" · "))}</span>` : ""}
            ${badges.length ? `<span class="word-cell-badges">${badges.map((badge) => `<span class="word-badge">${escapeHtml(badge)}</span>`).join("")}</span>` : ""}
          </div>
        </td>
        <td class="px-3 py-3 align-top text-label">${escapeHtml(entry.translation)}</td>
        <td class="known-cell">
          <button class="known-toggle" data-word-id="${entry.id}" data-known="${Boolean(entry.known)}">
            ${entry.known ? escapeHtml(t("word.known")) : escapeHtml(t("word.unknown"))}
          </button>
        </td>
      </tr>
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

// Extend the visible word window when the table scroll nears the bottom.
export function loadMoreWordsIfNeeded() {
  if (state.wordDisplayMode !== "infinite" || state.visibleWordCount >= state.words.length) {
    return;
  }

  const remainingScroll = elements.tableWrap.scrollHeight - elements.tableWrap.scrollTop - elements.tableWrap.clientHeight;
  if (remainingScroll > 120) {
    return;
  }

  state.visibleWordCount = Math.min(state.visibleWordCount + WORD_PAGE_SIZE, state.words.length);
  renderWords(state.words);
}
