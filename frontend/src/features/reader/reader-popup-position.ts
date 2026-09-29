/**
 * Pure positioning rules for the reader's floating popups (ported from
 * views/reader.js positionReaderWordInfo and views/reader-translation.js):
 * word-info beside the tapped token, and the translation popup beside the
 * selection on desktop or as a bottom/top-docked sheet on mobile, never
 * covering the selection.
 */

/** A rectangle in viewport coordinates (a DOMRect or a plain object). */
export interface Rect {
  top: number;
  left: number;
  bottom: number;
  right: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

const WORD_INFO_GAP = 10;
const WORD_INFO_MARGIN = 12;
/** Space kept free below word-info for the fixed page controls in mobile focus mode. */
const WORD_INFO_MOBILE_FOCUS_BOTTOM = 86;

export const TRANSLATION_GAP = 10;
export const TRANSLATION_MARGIN = 12;

/**
 * Word-info goes right of the token when it fits, else left of it, and is
 * vertically centred on the token within the viewport margins.
 */
export function wordInfoPosition(anchor: Rect, info: Size, viewport: Size, mobileFocus: boolean): { left: number; top: number } {
  const bottomReserved = mobileFocus ? WORD_INFO_MOBILE_FOCUS_BOTTOM : WORD_INFO_MARGIN;
  const rightLeft = anchor.right + WORD_INFO_GAP;
  const leftLeft = anchor.left - info.width - WORD_INFO_GAP;
  const left = rightLeft + info.width <= viewport.width - WORD_INFO_MARGIN ? rightLeft : Math.max(WORD_INFO_MARGIN, leftLeft);
  const top = Math.min(Math.max(WORD_INFO_MARGIN, anchor.top + anchor.height / 2 - info.height / 2), viewport.height - info.height - bottomReserved);
  return { left, top };
}

/**
 * Desktop translation popup: below the selection, flipped above when it does
 * not fit there. When neither side fits, the larger side is used and the
 * height is capped (`maxHeight`) to that space, so it never overlaps.
 */
export function translationAnchoredPosition(anchor: Rect, popup: Size, viewport: Size): { top: number; left: number; maxHeight: number | null } {
  const spaceBelow = viewport.height - TRANSLATION_MARGIN - (anchor.bottom + TRANSLATION_GAP);
  const spaceAbove = anchor.top - TRANSLATION_GAP - TRANSLATION_MARGIN;
  const placeBelow = popup.height <= spaceBelow || (popup.height > spaceAbove && spaceBelow >= spaceAbove);
  const available = Math.max(0, placeBelow ? spaceBelow : spaceAbove);
  const height = Math.min(popup.height, available);
  return {
    top: placeBelow ? anchor.bottom + TRANSLATION_GAP : anchor.top - TRANSLATION_GAP - height,
    left: Math.min(Math.max(TRANSLATION_MARGIN, anchor.left), Math.max(TRANSLATION_MARGIN, viewport.width - popup.width - TRANSLATION_MARGIN)),
    maxHeight: popup.height > available ? available : null
  };
}

/** Whether the sheet, laid out at `sheet`, leaves the selection visible. */
export function sheetClearsBelow(anchor: Rect, bottomSheet: Pick<Rect, "top">): boolean {
  return bottomSheet.top >= anchor.bottom + TRANSLATION_GAP;
}

/** Whether the sheet docked at the top leaves the selection visible. */
export function sheetClearsAbove(anchor: Rect, topSheet: Pick<Rect, "bottom">): boolean {
  return topSheet.bottom <= anchor.top - TRANSLATION_GAP;
}

/**
 * When neither the bottom nor the top-docked sheet clears the selection, the
 * side with more room is used and the height capped to that space.
 */
export function sheetFallback(anchor: Rect, bottomSheet: Pick<Rect, "bottom">, topSheet: Pick<Rect, "top">): { dockTop: boolean; maxHeight: number } {
  const spaceBelow = bottomSheet.bottom - (anchor.bottom + TRANSLATION_GAP);
  const spaceAbove = anchor.top - TRANSLATION_GAP - topSheet.top;
  return { dockTop: spaceBelow < spaceAbove, maxHeight: Math.max(0, Math.max(spaceBelow, spaceAbove)) };
}

/** The union of the given rectangles, or null when there are none. */
export function unionRect(rects: Rect[]): Rect | null {
  if (!rects.length) {
    return null;
  }
  const top = Math.min(...rects.map((rect) => rect.top));
  const left = Math.min(...rects.map((rect) => rect.left));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  const right = Math.max(...rects.map((rect) => rect.right));
  return { top, left, bottom, right, width: right - left, height: bottom - top };
}
