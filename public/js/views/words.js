import { elements } from "../dom.js";
import { state, WORD_PAGE_SIZE } from "../state.js";
import { formatCount, t } from "../i18n.js";
import { escapeHtml } from "../shared/html.js";
import { renderDisplayModeButtons } from "./shell.js";

// Render either the full collection or a windowed list for infinite scrolling.
// Render collection word rows, empty states, and result counts.
export function renderWords(words) {
  renderDisplayModeButtons();
  const visibleWords = state.wordDisplayMode === "infinite" ? words.slice(0, state.visibleWordCount) : words;
  elements.tableWrap.classList.toggle("is-scrollable", state.wordDisplayMode === "infinite" && words.length > WORD_PAGE_SIZE);

  elements.wordRows.innerHTML = visibleWords
    .map(
      (entry) => {
        const badges = [];
        if (entry.pos) badges.push(entry.pos);
        if (entry.posSubcategory && entry.posSubcategory !== entry.pos) badges.push(entry.posSubcategory);
        const phonetics = [];
        if (entry.reading) phonetics.push(entry.reading);
        if (entry.pinyin) phonetics.push(entry.pinyin);
        if (entry.traditional && entry.traditional !== entry.word) phonetics.push(entry.traditional);
        return `
      <tr>
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
  elements.wordListStatus.hidden = !words.length;
  elements.wordListStatus.textContent =
    state.wordDisplayMode === "infinite"
      ? t("collections.showingWords", {
          shown: formatCount(visibleWords.length),
          total: formatCount(words.length)
        })
      : t("collections.totalWords", { total: formatCount(words.length) });

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
