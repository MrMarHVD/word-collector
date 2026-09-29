/**
 * @fileoverview Reader translation popup — shows the selected original text
 * word by word above its English translation, with loading-model,
 * translating, done and error states. Anchored beside the selection on
 * desktop and rendered as a bottom (or top-docked) sheet on mobile, so the
 * selection is never covered.
 *
 * Driven entirely through an imperative API. It deliberately imports neither
 * the reader controller nor the translation service, to avoid circular
 * imports.
 */

import { elements } from "../dom.js";
import { t } from "../i18n.js";
import { escapeHtml } from "../shared/html.js";

const GAP = 10;
const MARGIN = 12;
const ERROR_KEYS = {
  unsupported: "reader.translation.error.unsupported",
  "model-unavailable": "reader.translation.error.modelUnavailable",
  failed: "reader.translation.error.failed"
};

let isOpen = false;
let currentAnchorRect = null;
let currentGetAnchorRect = null;
let currentOnClose = null;

function isMobileLayout() {
  return window.matchMedia("(max-width: 760px)").matches;
}

/**
 * Renders the original text as one element per word, carrying
 * `data-source-word-index`, with the gap text between words kept as plain
 * text. Mirrors how `sourceText` is rebuilt: each surface plus its trailing
 * gap, with the last gap trimmed, and the leading text of every word after the
 * first (set on block-initial tokens).
 *
 * @param {Array<{surface: string, leadingText: string, trailingText: string}>} words - Selected words in reading order.
 * @returns {string} The source markup.
 */
function renderSourceWords(words) {
  return words.map((word, index) => {
    const gap = word.trailingText ?? "";
    const trailing = index === words.length - 1 ? gap.trimEnd() : gap;
    const leading = index > 0 ? word.leadingText ?? "" : "";
    return `${escapeHtml(leading)}<span class="reader-translation-word" data-source-word-index="${index}">${escapeHtml(word.surface)}</span>${escapeHtml(trailing)}`;
  }).join("");
}

/**
 * Builds the result-area markup for a translation state.
 *
 * @param {{status: string, progress?: {loaded: number, total: number|null}, targetText?: string, errorCode?: string}} translationState
 * @returns {string} The result markup.
 */
function renderResult({ status, progress, targetText, errorCode }) {
  if (status === "done") {
    return `<p class="reader-translation-target">${escapeHtml(targetText ?? "")}</p>`;
  }
  if (status === "error") {
    const key = ERROR_KEYS[errorCode] || ERROR_KEYS.failed;
    return `<p class="reader-translation-message is-error" role="alert">${escapeHtml(t(key))}</p>`;
  }
  let message = t("reader.translation.translating");
  if (status === "loading-model") {
    message = progress?.total
      ? t("reader.translation.loadingModelProgress", { percent: Math.min(100, Math.max(0, Math.round((progress.loaded / progress.total) * 100))) })
      : t("reader.translation.loadingModel");
  }
  return `<p class="reader-translation-message">${escapeHtml(message)}</p>`;
}

/**
 * Places the popup beside the anchor, preferring below and flipping above
 * when it does not fit. When neither side fits, it uses the larger side and
 * caps its height to that space, so it never overlaps the anchor.
 *
 * @param {DOMRect|object} anchor - The selection rectangle in viewport coordinates.
 */
function positionAnchored(anchor) {
  const popup = elements.readerTranslation;
  const rect = popup.getBoundingClientRect();
  const spaceBelow = window.innerHeight - MARGIN - (anchor.bottom + GAP);
  const spaceAbove = anchor.top - GAP - MARGIN;
  const placeBelow = rect.height <= spaceBelow || (rect.height > spaceAbove && spaceBelow >= spaceAbove);
  const available = Math.max(0, placeBelow ? spaceBelow : spaceAbove);
  if (rect.height > available) {
    popup.style.setProperty("--readerTranslationMaxHeight", `${available}px`);
  }
  const height = Math.min(rect.height, available);
  const top = placeBelow ? anchor.bottom + GAP : anchor.top - GAP - height;
  const left = Math.min(Math.max(MARGIN, anchor.left), Math.max(MARGIN, window.innerWidth - rect.width - MARGIN));

  popup.style.setProperty("--readerTranslationTop", `${top}px`);
  popup.style.setProperty("--readerTranslationLeft", `${left}px`);
}

/**
 * Places the mobile sheet at the bottom when that leaves the anchor visible,
 * otherwise docks it at the top. When neither fits, it uses the side with
 * more room and caps its height to that space.
 *
 * @param {DOMRect|object} anchor - The selection rectangle in viewport coordinates.
 */
function positionSheet(anchor) {
  const popup = elements.readerTranslation;
  const bottomRect = popup.getBoundingClientRect();
  if (bottomRect.top >= anchor.bottom + GAP) {
    return;
  }
  popup.classList.add("is-docked-top");
  const topRect = popup.getBoundingClientRect();
  if (topRect.bottom <= anchor.top - GAP) {
    return;
  }
  const spaceBelow = bottomRect.bottom - (anchor.bottom + GAP);
  const spaceAbove = anchor.top - GAP - topRect.top;
  if (spaceBelow >= spaceAbove) {
    popup.classList.remove("is-docked-top");
  }
  popup.style.setProperty("--readerTranslationMaxHeight", `${Math.max(0, Math.max(spaceBelow, spaceAbove))}px`);
}

/**
 * Re-measures and positions the open popup against the current anchor,
 * re-measured through `getAnchorRect` when supplied so it follows scrolling
 * and reflow. Hidden while measuring to avoid a layout flash.
 */
function positionReaderTranslation() {
  if (!isOpen) {
    return;
  }
  currentAnchorRect = currentGetAnchorRect?.() || currentAnchorRect;
  if (!currentAnchorRect) {
    return;
  }
  const popup = elements.readerTranslation;
  popup.style.visibility = "hidden";
  popup.classList.remove("is-docked-top");
  popup.style.removeProperty("--readerTranslationMaxHeight");
  if (isMobileLayout()) {
    positionSheet(currentAnchorRect);
  } else {
    positionAnchored(currentAnchorRect);
  }
  popup.style.visibility = "";
}

function handleClick(event) {
  if (event.target.closest("[data-reader-translation-close]")) {
    closeReaderTranslation();
  }
}

function handleKeydown(event) {
  if (event.key === "Escape") {
    closeReaderTranslation();
  }
}

/**
 * Opens the translation popup in the "translating" status, or replaces its
 * content and re-positions it when already open. The caller sets
 * "loading-model" afterwards if needed.
 *
 * @param {object} options
 * @param {Array<{tokenId: string, surface: string, leadingText: string, trailingText: string}>} options.words - Selected words in reading order.
 * @param {string} options.sourceText - The selected original text (the words already carry it, so it is not read here).
 * @param {{top: number, left: number, bottom: number, right: number, width: number, height: number}} options.anchorRect - The selection rectangle in viewport coordinates.
 * @param {function(): (object|null)} [options.getAnchorRect] - Re-measures the selection rectangle on
 *   resize and scroll; `null` keeps the last known rectangle.
 * @param {Function} [options.onClose] - Called once when the popup closes.
 */
export function openReaderTranslation({ words, anchorRect, getAnchorRect, onClose }) {
  const popup = elements.readerTranslation;
  currentAnchorRect = anchorRect;
  currentGetAnchorRect = getAnchorRect || null;
  currentOnClose = onClose || null;
  popup.innerHTML = `
    <div class="reader-translation-head">
      <span class="reader-translation-label">${escapeHtml(t("reader.translation.original"))}</span>
      <button class="reader-word-info-close" type="button" data-reader-translation-close aria-label="${escapeHtml(t("reader.closeTranslation"))}">&times;</button>
    </div>
    <p class="reader-translation-source">${renderSourceWords(words)}</p>
    <span class="reader-translation-label">${escapeHtml(t("reader.translation.target"))}</span>
    <div class="reader-translation-result" data-reader-translation-result aria-live="polite">${renderResult({ status: "translating" })}</div>
  `;
  popup.hidden = false;
  if (!isOpen) {
    isOpen = true;
    popup.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKeydown);
    window.addEventListener("resize", positionReaderTranslation);
    window.addEventListener("scroll", positionReaderTranslation);
    elements.readerText.addEventListener("scroll", positionReaderTranslation);
  }
  positionReaderTranslation();
}

/**
 * Updates the translation area without re-rendering the original text, then
 * re-positions for the new content height. No-op when closed.
 *
 * @param {{status: "loading-model"|"translating"|"done"|"error", progress?: {loaded: number, total: number|null}, targetText?: string, errorCode?: string}} translationState
 */
export function setReaderTranslationState(translationState) {
  if (!isOpen) {
    return;
  }
  elements.readerTranslation.querySelector("[data-reader-translation-result]").innerHTML = renderResult(translationState);
  positionReaderTranslation();
}

/**
 * Hides the popup and calls the `onClose` supplied to `openReaderTranslation`.
 * No-op when already closed.
 */
export function closeReaderTranslation() {
  if (!isOpen) {
    return;
  }
  const popup = elements.readerTranslation;
  const onClose = currentOnClose;
  isOpen = false;
  currentAnchorRect = null;
  currentGetAnchorRect = null;
  currentOnClose = null;
  popup.removeEventListener("click", handleClick);
  document.removeEventListener("keydown", handleKeydown);
  window.removeEventListener("resize", positionReaderTranslation);
  window.removeEventListener("scroll", positionReaderTranslation);
  elements.readerText.removeEventListener("scroll", positionReaderTranslation);
  popup.hidden = true;
  popup.innerHTML = "";
  onClose?.();
}

/**
 * @returns {boolean} Whether the translation popup is open.
 */
export function isReaderTranslationOpen() {
  return isOpen;
}
