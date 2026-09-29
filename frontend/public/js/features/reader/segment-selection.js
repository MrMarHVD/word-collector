/**
 * @fileoverview Reader segment selection — lets eligible readers (Japanese
 * material, English native language) drag-select a contiguous run of tokens on
 * the current page. Mouse selection starts once a press moves past the hold
 * threshold; touch and pen selection start after a press-and-hold. On release
 * with two or more tokens, the exact source text is rebuilt from
 * `state.readerTokens` and a `reader:segment-selected` event is dispatched on
 * `document`.
 */

import { elements } from "../../dom.js";
import { state } from "../../state.js";

const SEGMENT_SELECTED_CLASS = "is-segment-selected";
const SEGMENT_SELECTING_CLASS = "is-reader-segment-selecting";
const MIN_SEGMENT_TOKENS = 2;

let segmentPress = null;

/**
 * Whether drag-selection for sentence translation applies to this reader.
 *
 * @param {object|null} material - The material being read (`state.currentMaterial`).
 * @param {object|null} user - The signed-in user (`state.user`).
 * @returns {boolean} `true` only for Japanese material read by an English
 *   native speaker, compared case-insensitively.
 */
export function isSegmentTranslationEligible(material, user) {
  return String(material?.languageName || "").toLowerCase() === "japanese"
    && String(user?.nativeLanguage || "").toLowerCase() === "english";
}

/**
 * Removes the segment highlight from all reader tokens and resets the
 * selection state.
 */
export function clearReaderSegmentSelection() {
  if (segmentPress) {
    segmentPress.anchorIndex = -1;
    segmentPress.focusIndex = -1;
  }
  elements.readerText.querySelectorAll(`.${SEGMENT_SELECTED_CLASS}`).forEach((entry) => entry.classList.remove(SEGMENT_SELECTED_CLASS));
}

/**
 * Stops touch scrolling while a segment selection is being dragged. Must be
 * bound once, non-passive, on `#readerText`: a listener added mid-gesture may
 * come too late for the browser to treat that touch sequence as cancelable.
 * Does nothing when no selection is active, so taps, scrolling, page-turn
 * swipes and non-eligible readers are unaffected.
 *
 * @param {TouchEvent} event - A `touchmove` event on the reader text.
 */
export function preventReaderSegmentScroll(event) {
  if (segmentPress?.selecting && event.cancelable) {
    event.preventDefault();
  }
}

function highlightSegmentRange(press) {
  const start = Math.min(press.anchorIndex, press.focusIndex);
  const end = Math.max(press.anchorIndex, press.focusIndex);
  press.buttons.forEach((entry, index) => entry.classList.toggle(SEGMENT_SELECTED_CLASS, start >= 0 && index >= start && index <= end));
}

function beginSegmentSelection(press) {
  clearReaderSegmentSelection();
  press.selecting = true;
  press.buttons = [...elements.readerText.querySelectorAll(".reader-token[data-token-id]")];
  press.anchorIndex = press.buttons.indexOf(press.anchor);
  press.focusIndex = press.anchorIndex;
  document.body.classList.add(SEGMENT_SELECTING_CLASS);
  window.getSelection()?.removeAllRanges();
  highlightSegmentRange(press);
}

function extendSegmentSelection(press, clientX, clientY) {
  if (press.anchorIndex < 0) {
    return;
  }
  const button = document.elementFromPoint(clientX, clientY)?.closest(".reader-token[data-token-id]");
  const index = press.buttons.indexOf(button);
  if (index < 0 || index === press.focusIndex) {
    return;
  }
  press.focusIndex = index;
  highlightSegmentRange(press);
}

function endSegmentPress(press) {
  clearTimeout(press.timer);
  document.removeEventListener("pointermove", press.moveHandler);
  document.removeEventListener("pointerup", press.upHandler);
  document.removeEventListener("pointercancel", press.cancelHandler);
  document.removeEventListener("touchmove", press.touchMoveHandler);
  document.removeEventListener("contextmenu", press.contextMenuHandler);
  document.body.classList.remove(SEGMENT_SELECTING_CLASS);
  if (segmentPress === press) {
    segmentPress = null;
  }
}

function segmentAnchorRect(buttons) {
  const rects = buttons.map((button) => button.getBoundingClientRect());
  const top = Math.min(...rects.map((rect) => rect.top));
  const left = Math.min(...rects.map((rect) => rect.left));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  const right = Math.max(...rects.map((rect) => rect.right));
  return { top, left, bottom, right, width: right - left, height: bottom - top };
}

/**
 * Measures the highlighted segment as it is laid out now, so a popup can
 * follow it through scrolling and reflow.
 *
 * @returns {{top: number, left: number, bottom: number, right: number, width: number, height: number}|null}
 *   The bounding rectangle in viewport coordinates, or null when nothing is highlighted.
 */
export function readerSegmentAnchorRect() {
  const buttons = [...elements.readerText.querySelectorAll(`.${SEGMENT_SELECTED_CLASS}`)];
  return buttons.length ? segmentAnchorRect(buttons) : null;
}

// The source text comes from token data, never from the DOM: "show word
// spaces" injects spaces between tokens that are not part of the text. A
// block's first token carries the text before it in leadingText, so that is
// kept for every word after the first.
function segmentDetail(buttons) {
  const tokensById = new Map(state.readerTokens.map((token) => [token.id, token]));
  const words = buttons
    .map((button) => tokensById.get(Number(button.dataset.tokenId)))
    .filter(Boolean)
    .map((token) => ({
      tokenId: String(token.id),
      surface: token.surface,
      leadingText: token.leadingText ?? "",
      trailingText: token.trailingText ?? ""
    }));
  const sourceText = words
    .map((word, index) => (index > 0 ? word.leadingText : "") + word.surface + (index === words.length - 1 ? word.trailingText.trimEnd() : word.trailingText))
    .join("");
  return { sourceText, words, anchorRect: segmentAnchorRect(buttons) };
}

function finishSegmentPress(press) {
  endSegmentPress(press);
  if (!press.selecting) {
    return;
  }
  press.onSelectionEnd();
  if (press.anchorIndex < 0) {
    return;
  }
  const start = Math.min(press.anchorIndex, press.focusIndex);
  const end = Math.max(press.anchorIndex, press.focusIndex);
  const buttons = press.buttons.slice(start, end + 1);
  if (buttons.length < MIN_SEGMENT_TOKENS) {
    clearReaderSegmentSelection();
    return;
  }
  document.dispatchEvent(new CustomEvent("reader:segment-selected", { detail: segmentDetail(buttons) }));
}

/**
 * Starts tracking a press on a reader token that may become a segment
 * selection. A mouse press selects once it moves past `moveThreshold`; a touch
 * or pen press selects after being held for `holdDelayMs` without moving past
 * `moveThreshold`, so taps, scrolling and swipes are left alone until then.
 * Once selecting, scrolling and the native long-press menu are suppressed.
 *
 * @param {PointerEvent} event - The `pointerdown` event on the token.
 * @param {HTMLElement} button - The pressed `.reader-token` button.
 * @param {{ holdDelayMs: number, moveThreshold: number, onSelectionEnd: function(): void }} options
 * @param {number} options.holdDelayMs - Touch/pen hold time before selecting.
 * @param {number} options.moveThreshold - Movement in px that starts a mouse
 *   selection, or cancels a touch/pen press before the hold completes.
 * @param {function(): void} options.onSelectionEnd - Called on release of a
 *   press that started selecting, so the caller can swallow the follow-up
 *   click and swipe.
 */
export function startReaderSegmentPress(event, button, { holdDelayMs, moveThreshold, onSelectionEnd }) {
  if (event.pointerType === "mouse" && event.button !== 0) {
    return;
  }
  if (segmentPress) {
    endSegmentPress(segmentPress);
  }
  const press = {
    anchor: button,
    anchorIndex: -1,
    buttons: [],
    focusIndex: -1,
    onSelectionEnd,
    pointerId: event.pointerId,
    pointerType: event.pointerType,
    selecting: false,
    startX: event.clientX,
    startY: event.clientY
  };

  press.moveHandler = (moveEvent) => {
    if (moveEvent.pointerId !== press.pointerId) {
      return;
    }
    // A mouse button released outside the window sends no pointerup, so end
    // the press with the selection as it was when the pointer left.
    if (press.pointerType === "mouse" && (moveEvent.buttons & 1) === 0) {
      finishSegmentPress(press);
      return;
    }
    if (!press.selecting) {
      if (Math.hypot(moveEvent.clientX - press.startX, moveEvent.clientY - press.startY) <= moveThreshold) {
        return;
      }
      if (press.pointerType !== "mouse") {
        endSegmentPress(press);
        return;
      }
      beginSegmentSelection(press);
    }
    moveEvent.preventDefault();
    extendSegmentSelection(press, moveEvent.clientX, moveEvent.clientY);
  };

  // Scrolling is blocked by preventReaderSegmentScroll; this only extends.
  press.touchMoveHandler = (touchEvent) => {
    if (!press.selecting) {
      return;
    }
    const touch = touchEvent.touches[0];
    if (touch) {
      extendSegmentSelection(press, touch.clientX, touch.clientY);
    }
  };

  press.upHandler = (upEvent) => {
    if (upEvent.pointerId !== press.pointerId) {
      return;
    }
    if (press.selecting) {
      upEvent.preventDefault();
      extendSegmentSelection(press, upEvent.clientX, upEvent.clientY);
    }
    finishSegmentPress(press);
  };

  press.cancelHandler = (cancelEvent) => {
    if (cancelEvent.pointerId !== press.pointerId) {
      return;
    }
    if (press.selecting) {
      clearReaderSegmentSelection();
    }
    finishSegmentPress(press);
  };

  press.contextMenuHandler = (menuEvent) => {
    if (press.pointerType !== "mouse") {
      menuEvent.preventDefault();
    }
  };

  if (press.pointerType !== "mouse") {
    press.timer = window.setTimeout(() => {
      if (segmentPress === press) {
        beginSegmentSelection(press);
      }
    }, holdDelayMs);
  }

  segmentPress = press;
  document.addEventListener("pointermove", press.moveHandler, { passive: false });
  document.addEventListener("pointerup", press.upHandler, { passive: false });
  document.addEventListener("pointercancel", press.cancelHandler);
  document.addEventListener("touchmove", press.touchMoveHandler);
  document.addEventListener("contextmenu", press.contextMenuHandler);
}
