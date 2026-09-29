/**
 * Pointer, touch and wheel gestures on the reader text (ported from
 * reader.controller.js and features/reader/segment-selection.js). Kept as a
 * plain DOM controller over #readerText rather than React handlers, because
 * the gestures need document-level, non-passive listeners and must see every
 * event in order:
 *
 * - tap/click on a token: word-info (via `onTokenClick`);
 * - press-and-hold on a token: the radial quick menu, for readers who are not
 *   eligible for sentence translation;
 * - drag (mouse) or hold-then-drag (touch, pen) across tokens: segment
 *   selection, for eligible readers, ending in a `reader:segment-selected`
 *   event on `document` (SPEC-002 contract C3);
 * - horizontal trackpad wheel and single-finger swipe: page turns.
 *
 * After a completed hold or drag, the click and swipe that follow are
 * swallowed for READER_SUPPRESS_CLICK_MS. React renders the menu, highlights
 * and popups from the callbacks.
 */

import type { ReaderToken } from "@/lib/api/types";
import { createWheelPageTurnTracker, swipePageDirection } from "./page-turn-gestures";
import {
  QUICK_MENU_ACTIONS,
  READER_HOLD_CANCEL_DISTANCE,
  READER_HOLD_DELAY_MS,
  closestQuickMenuAction,
  quickMenuOrigin,
  type Point,
  type QuickMenuActionKey
} from "./quick-menu";
import type { PageDirection } from "./reader-pagination";
import { unionRect, type Rect } from "./reader-popup-position";
import { MIN_SEGMENT_TOKENS, segmentSourceText, segmentWords, type SegmentWord } from "./segment-text";

const READER_SUPPRESS_CLICK_MS = 300;
const SEGMENT_SELECTED_CLASS = "is-segment-selected";
const SEGMENT_SELECTING_CLASS = "is-reader-segment-selecting";
const CONVENIENCE_ACTIVE_CLASS = "is-reader-convenience-active";
const TOKEN_SELECTOR = ".reader-token[data-token-id]";

/** Name of the event dispatched on `document` when a segment selection ends. */
export const SEGMENT_SELECTED_EVENT = "reader:segment-selected";

/** Detail of the `reader:segment-selected` event. */
export interface SegmentSelectedDetail {
  /** The exact original text, rebuilt from token data. */
  sourceText: string;
  words: SegmentWord[];
  /** Union of the selected tokens' rectangles in viewport coordinates. */
  anchorRect: Rect;
}

/** Inclusive range of highlighted token indices, in page order. */
export interface SegmentRange {
  start: number;
  end: number;
}

export interface ReaderGestureCallbacks {
  /** Whether the reader may drag-select segments (Japanese material, English native language). */
  isSegmentEligible: () => boolean;
  /** A visible token by id. */
  tokenById: (tokenId: number) => ReaderToken | undefined;
  /** A token was clicked or tapped. */
  onTokenClick: (button: HTMLElement) => void;
  onTurnPage: (direction: PageDirection) => void;
  /** The quick menu opened for `token`, centred at `origin`. */
  onQuickMenuShow: (token: ReaderToken, origin: Point) => void;
  /** The option under the pointer changed. */
  onQuickMenuSelect: (key: QuickMenuActionKey | null) => void;
  onQuickMenuHide: () => void;
  /** The pointer was released over `key` (null: released near the centre). */
  onQuickMenuRelease: (token: ReaderToken, key: QuickMenuActionKey | null) => void;
  /** The highlighted segment changed (null: nothing highlighted). */
  onSegmentRange: (range: SegmentRange | null) => void;
}

export interface ReaderGestures {
  /** Clears the segment highlight and resets the selection state. */
  clearSegmentSelection: () => void;
  /** The highlighted segment as laid out now, so a popup can follow it through scrolling and reflow. */
  segmentAnchorRect: () => Rect | null;
  /** Removes every listener and any open menu or selection state. */
  detach: () => void;
}

interface ConveniencePress {
  kind: "press";
  active: boolean;
  button: HTMLElement;
  token: ReaderToken;
  pointerId: number;
  startX: number;
  startY: number;
  origin: Point;
  selectedKey: QuickMenuActionKey | null;
  timer: number;
  moveHandler: (event: PointerEvent) => void;
  upHandler: (event: PointerEvent) => void;
  cancelHandler: (event: PointerEvent) => void;
}

interface SegmentPress {
  anchor: HTMLElement;
  anchorIndex: number;
  buttons: HTMLElement[];
  focusIndex: number;
  onSelectionEnd: () => void;
  pointerId: number;
  pointerType: string;
  selecting: boolean;
  startX: number;
  startY: number;
  timer: number;
  moveHandler: (event: PointerEvent) => void;
  upHandler: (event: PointerEvent) => void;
  cancelHandler: (event: PointerEvent) => void;
  touchMoveHandler: (event: TouchEvent) => void;
  contextMenuHandler: (event: Event) => void;
}

/** Attaches the reader gestures to #readerText. Call `detach()` on unmount. */
export function attachReaderGestures(readerText: HTMLElement, callbacks: ReaderGestureCallbacks): ReaderGestures {
  /** The pending or open quick menu, or the post-gesture click suppression. */
  let convenience: ConveniencePress | { kind: "suppress" } | null = null;
  let segmentPress: SegmentPress | null = null;

  // ------------------------------------------------------------ quick menu

  function removeConvenienceMenu({ suppressClick = false } = {}) {
    if (!convenience) {
      return;
    }
    if (convenience.kind === "press") {
      const press = convenience;
      window.clearTimeout(press.timer);
      if (press.active) {
        document.body.classList.remove(CONVENIENCE_ACTIVE_CLASS);
        callbacks.onQuickMenuHide();
      }
      document.removeEventListener("pointermove", press.moveHandler);
      document.removeEventListener("pointerup", press.upHandler);
      document.removeEventListener("pointercancel", press.cancelHandler);
    }
    convenience = null;
    if (suppressClick) {
      suppressReaderClick();
    }
  }

  // Swallow the click and swipe that follow a completed hold or drag gesture.
  function suppressReaderClick() {
    const suppression = { kind: "suppress" as const };
    convenience = suppression;
    window.setTimeout(() => {
      if (convenience === suppression) {
        convenience = null;
      }
    }, READER_SUPPRESS_CLICK_MS);
  }

  function updateConvenienceSelection(press: ConveniencePress, clientX: number, clientY: number) {
    if (!press.active) {
      return;
    }
    press.selectedKey = closestQuickMenuAction(press.origin, { x: clientX, y: clientY }, QUICK_MENU_ACTIONS)?.key ?? null;
    callbacks.onQuickMenuSelect(press.selectedKey);
  }

  function showConvenienceMenu(press: ConveniencePress) {
    press.origin = quickMenuOrigin({ x: press.startX, y: press.startY }, { width: window.innerWidth, height: window.innerHeight });
    document.body.classList.add(CONVENIENCE_ACTIVE_CLASS);
    press.active = true;
    callbacks.onQuickMenuShow(press.token, press.origin);
  }

  function startConveniencePress(event: PointerEvent, button: HTMLElement) {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }
    const token = callbacks.tokenById(Number(button.dataset.tokenId));
    if (!token?.wordId) {
      return;
    }
    removeConvenienceMenu();
    const press: ConveniencePress = {
      kind: "press",
      active: false,
      button,
      token,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: { x: event.clientX, y: event.clientY },
      selectedKey: null,
      timer: 0,
      moveHandler: (moveEvent) => {
        if (moveEvent.pointerId !== press.pointerId) {
          return;
        }
        if (!press.active) {
          if (Math.hypot(moveEvent.clientX - press.startX, moveEvent.clientY - press.startY) > READER_HOLD_CANCEL_DISTANCE) {
            removeConvenienceMenu();
          }
          return;
        }
        moveEvent.preventDefault();
        updateConvenienceSelection(press, moveEvent.clientX, moveEvent.clientY);
      },
      upHandler: (upEvent) => {
        if (upEvent.pointerId !== press.pointerId) {
          return;
        }
        if (!press.active) {
          removeConvenienceMenu();
          return;
        }
        upEvent.preventDefault();
        updateConvenienceSelection(press, upEvent.clientX, upEvent.clientY);
        removeConvenienceMenu({ suppressClick: true });
        callbacks.onQuickMenuRelease(press.token, press.selectedKey);
      },
      cancelHandler: (cancelEvent) => {
        if (cancelEvent.pointerId === press.pointerId) {
          removeConvenienceMenu({ suppressClick: press.active });
        }
      }
    };
    press.timer = window.setTimeout(() => {
      if (convenience === press) {
        showConvenienceMenu(press);
      }
    }, READER_HOLD_DELAY_MS);
    convenience = press;
    document.addEventListener("pointermove", press.moveHandler, { passive: false });
    document.addEventListener("pointerup", press.upHandler, { passive: false });
    document.addEventListener("pointercancel", press.cancelHandler);
  }

  // ------------------------------------------------------ segment selection

  function clearSegmentSelection() {
    if (segmentPress) {
      segmentPress.anchorIndex = -1;
      segmentPress.focusIndex = -1;
    }
    callbacks.onSegmentRange(null);
  }

  function highlightSegmentRange(press: SegmentPress) {
    const start = Math.min(press.anchorIndex, press.focusIndex);
    const end = Math.max(press.anchorIndex, press.focusIndex);
    callbacks.onSegmentRange(start >= 0 ? { start, end } : null);
  }

  function beginSegmentSelection(press: SegmentPress) {
    clearSegmentSelection();
    press.selecting = true;
    press.buttons = [...readerText.querySelectorAll<HTMLElement>(TOKEN_SELECTOR)];
    press.anchorIndex = press.buttons.indexOf(press.anchor);
    press.focusIndex = press.anchorIndex;
    document.body.classList.add(SEGMENT_SELECTING_CLASS);
    window.getSelection()?.removeAllRanges();
    highlightSegmentRange(press);
  }

  function extendSegmentSelection(press: SegmentPress, clientX: number, clientY: number) {
    if (press.anchorIndex < 0) {
      return;
    }
    const button = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>(TOKEN_SELECTOR);
    const index = button ? press.buttons.indexOf(button) : -1;
    if (index < 0 || index === press.focusIndex) {
      return;
    }
    press.focusIndex = index;
    highlightSegmentRange(press);
  }

  function endSegmentPress(press: SegmentPress) {
    window.clearTimeout(press.timer);
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

  function segmentDetail(buttons: HTMLElement[]): SegmentSelectedDetail {
    const tokens = buttons.map((button) => callbacks.tokenById(Number(button.dataset.tokenId))).filter((token): token is ReaderToken => Boolean(token));
    const words = segmentWords(tokens);
    return { sourceText: segmentSourceText(words), words, anchorRect: unionRect(buttons.map((button) => button.getBoundingClientRect()))! };
  }

  function finishSegmentPress(press: SegmentPress) {
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
      clearSegmentSelection();
      return;
    }
    document.dispatchEvent(new CustomEvent<SegmentSelectedDetail>(SEGMENT_SELECTED_EVENT, { detail: segmentDetail(buttons) }));
  }

  /**
   * A mouse press selects once it moves past the hold threshold; a touch or pen
   * press selects after being held without moving past it, so taps, scrolling
   * and swipes are left alone until then. Once selecting, scrolling and the
   * native long-press menu are suppressed.
   */
  function startSegmentPress(event: PointerEvent, button: HTMLElement) {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }
    if (segmentPress) {
      endSegmentPress(segmentPress);
    }
    const press: SegmentPress = {
      anchor: button,
      anchorIndex: -1,
      buttons: [],
      focusIndex: -1,
      onSelectionEnd: suppressReaderClick,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      selecting: false,
      startX: event.clientX,
      startY: event.clientY,
      timer: 0,
      moveHandler: (moveEvent) => {
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
          if (Math.hypot(moveEvent.clientX - press.startX, moveEvent.clientY - press.startY) <= READER_HOLD_CANCEL_DISTANCE) {
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
      },
      // Scrolling is blocked by preventSegmentScroll; this only extends.
      touchMoveHandler: (touchEvent) => {
        if (!press.selecting) {
          return;
        }
        const touch = touchEvent.touches[0];
        if (touch) {
          extendSegmentSelection(press, touch.clientX, touch.clientY);
        }
      },
      upHandler: (upEvent) => {
        if (upEvent.pointerId !== press.pointerId) {
          return;
        }
        if (press.selecting) {
          upEvent.preventDefault();
          extendSegmentSelection(press, upEvent.clientX, upEvent.clientY);
        }
        finishSegmentPress(press);
      },
      cancelHandler: (cancelEvent) => {
        if (cancelEvent.pointerId !== press.pointerId) {
          return;
        }
        if (press.selecting) {
          clearSegmentSelection();
        }
        finishSegmentPress(press);
      },
      contextMenuHandler: (menuEvent) => {
        if (press.pointerType !== "mouse") {
          menuEvent.preventDefault();
        }
      }
    };
    if (press.pointerType !== "mouse") {
      press.timer = window.setTimeout(() => {
        if (segmentPress === press) {
          beginSegmentSelection(press);
        }
      }, READER_HOLD_DELAY_MS);
    }
    segmentPress = press;
    document.addEventListener("pointermove", press.moveHandler, { passive: false });
    document.addEventListener("pointerup", press.upHandler, { passive: false });
    document.addEventListener("pointercancel", press.cancelHandler);
    document.addEventListener("touchmove", press.touchMoveHandler);
    document.addEventListener("contextmenu", press.contextMenuHandler);
  }

  /**
   * Stops touch scrolling while a segment selection is being dragged. Bound
   * once, non-passive, on #readerText: a listener added mid-gesture may come
   * too late for the browser to treat that touch sequence as cancelable.
   */
  function preventSegmentScroll(event: TouchEvent) {
    if (segmentPress?.selecting && event.cancelable) {
      event.preventDefault();
    }
  }

  // ------------------------------------------------------------ page turns

  const trackWheel = createWheelPageTurnTracker();
  function handleWheel(event: WheelEvent) {
    const direction = trackWheel(event);
    if (direction === "ignore") {
      return;
    }
    // Stop the browser's own back/forward swipe navigation.
    event.preventDefault();
    if (direction) {
      callbacks.onTurnPage(direction);
    }
  }

  let touchStartX = 0;
  let touchStartY = 0;
  let touchTracking = false;

  function handleTouchStart(event: TouchEvent) {
    // Only single-finger drags; multi-touch (e.g. pinch) is ignored.
    touchTracking = event.touches.length === 1;
    if (touchTracking) {
      touchStartX = event.touches[0].clientX;
      touchStartY = event.touches[0].clientY;
    }
  }

  function handleTouchEnd(event: TouchEvent) {
    if ((convenience?.kind === "press" && convenience.active) || convenience?.kind === "suppress") {
      touchTracking = false;
      return;
    }
    if (!touchTracking) {
      return;
    }
    touchTracking = false;
    const touch = event.changedTouches[0];
    const direction = swipePageDirection(touch.clientX - touchStartX, touch.clientY - touchStartY);
    if (direction) {
      callbacks.onTurnPage(direction);
    }
  }

  // ------------------------------------------------------- press and click

  function handlePointerDown(event: PointerEvent) {
    const button = (event.target as Element | null)?.closest<HTMLElement>("[data-token-id]");
    if (!button) {
      return;
    }
    // Japanese→English readers drag-select segments instead of using the quick menu.
    if (callbacks.isSegmentEligible()) {
      // A touch drag produces no follow-up click, so a suppression left by the
      // previous gesture must not swallow this new press's click.
      if (convenience?.kind === "suppress") {
        convenience = null;
      }
      startSegmentPress(event, button);
      return;
    }
    startConveniencePress(event, button);
  }

  function handleClick(event: MouseEvent) {
    if (convenience?.kind === "suppress") {
      event.preventDefault();
      event.stopPropagation();
      removeConvenienceMenu();
      return;
    }
    const button = (event.target as Element | null)?.closest<HTMLElement>("[data-token-id]");
    if (button) {
      callbacks.onTokenClick(button);
    }
  }

  readerText.addEventListener("wheel", handleWheel, { passive: false });
  readerText.addEventListener("touchstart", handleTouchStart, { passive: true });
  readerText.addEventListener("touchend", handleTouchEnd, { passive: true });
  readerText.addEventListener("touchmove", preventSegmentScroll, { passive: false });
  readerText.addEventListener("pointerdown", handlePointerDown);
  readerText.addEventListener("click", handleClick);

  return {
    clearSegmentSelection,
    segmentAnchorRect: () => unionRect([...readerText.querySelectorAll(`.${SEGMENT_SELECTED_CLASS}`)].map((button) => button.getBoundingClientRect())),
    detach: () => {
      removeConvenienceMenu();
      if (segmentPress) {
        endSegmentPress(segmentPress);
      }
      readerText.removeEventListener("wheel", handleWheel);
      readerText.removeEventListener("touchstart", handleTouchStart);
      readerText.removeEventListener("touchend", handleTouchEnd);
      readerText.removeEventListener("touchmove", preventSegmentScroll);
      readerText.removeEventListener("pointerdown", handlePointerDown);
      readerText.removeEventListener("click", handleClick);
    }
  };
}
