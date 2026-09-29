/**
 * Pure page-turn gesture rules (ported from reader.controller.js): a
 * two-finger horizontal trackpad swipe (horizontal wheel deltas) on desktop,
 * and a single-finger horizontal swipe on touch devices. Vertical scrolling
 * is never treated as a page turn.
 */

import type { PageDirection } from "./reader-pagination";

export const WHEEL_PAGE_THRESHOLD = 80;
export const WHEEL_GESTURE_END_MS = 90;
export const TOUCH_PAGE_THRESHOLD = 50;

export interface WheelSample {
  deltaX: number;
  deltaY: number;
  timeStamp: number;
}

/**
 * Tracks horizontal wheel streams. Returns "ignore" for vertical-dominant
 * events (left to the browser), otherwise the event should be prevented (it
 * would trigger back/forward swipe navigation) and the result is the page
 * direction to turn, or null.
 *
 * A trackpad gives no "fingers lifted" event: momentum keeps firing wheel
 * events after the fingers leave. One continuous stream is treated as a single
 * gesture, finished once it has gone quiet for WHEEL_GESTURE_END_MS. Once a
 * gesture has turned a page, the rest of its stream (the momentum tail) is
 * ignored, so one gesture turns exactly one page.
 */
export function createWheelPageTurnTracker(): (sample: WheelSample) => PageDirection | null | "ignore" {
  let accumX = 0;
  let locked = false;
  let lastTime = 0;
  return ({ deltaX, deltaY, timeStamp }) => {
    if (Math.abs(deltaX) <= Math.abs(deltaY)) {
      return "ignore";
    }
    const gestureEnded = timeStamp - lastTime > WHEEL_GESTURE_END_MS;
    lastTime = timeStamp;
    if (gestureEnded) {
      locked = false;
      accumX = 0;
    }
    if (locked) {
      return null;
    }
    accumX += deltaX;
    if (Math.abs(accumX) >= WHEEL_PAGE_THRESHOLD) {
      const direction = accumX > 0 ? "next" : "prev";
      accumX = 0;
      locked = true;
      return direction;
    }
    return null;
  };
}

/**
 * The page direction of a finished single-finger drag: swipe left advances,
 * swipe right goes back. Taps and vertical-dominant drags return null so word
 * selection and scrolling keep working.
 */
export function swipePageDirection(deltaX: number, deltaY: number): PageDirection | null {
  if (Math.abs(deltaX) < TOUCH_PAGE_THRESHOLD || Math.abs(deltaX) <= Math.abs(deltaY)) {
    return null;
  }
  return deltaX < 0 ? "next" : "prev";
}
