import { describe, expect, it } from "vitest";
import {
  sheetClearsAbove,
  sheetClearsBelow,
  sheetFallback,
  translationAnchoredPosition,
  unionRect,
  wordInfoPosition,
  type Rect
} from "./reader-popup-position";

function rect(left: number, top: number, width: number, height: number): Rect {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

const viewport = { width: 1200, height: 800 };

describe("wordInfoPosition", () => {
  it("goes right of the word, vertically centred", () => {
    expect(wordInfoPosition(rect(100, 300, 40, 20), { width: 300, height: 200 }, viewport, false)).toEqual({ left: 150, top: 210 });
  });

  it("flips left of the word when the right side is too narrow, within the margin", () => {
    expect(wordInfoPosition(rect(1000, 300, 40, 20), { width: 300, height: 200 }, viewport, false).left).toBe(690);
    expect(wordInfoPosition(rect(200, 300, 900, 20), { width: 300, height: 200 }, viewport, false).left).toBe(12);
  });

  it("stays inside the viewport vertically, keeping room for the controls in the mobile Reader", () => {
    expect(wordInfoPosition(rect(100, 0, 40, 20), { width: 300, height: 200 }, viewport, false).top).toBe(12);
    expect(wordInfoPosition(rect(100, 780, 40, 20), { width: 300, height: 200 }, viewport, false).top).toBe(588);
    expect(wordInfoPosition(rect(100, 780, 40, 20), { width: 300, height: 200 }, viewport, true).top).toBe(514);
  });
});

describe("translationAnchoredPosition", () => {
  it("prefers below the selection", () => {
    expect(translationAnchoredPosition(rect(100, 100, 200, 30), { width: 300, height: 150 }, viewport)).toEqual({ top: 140, left: 100, maxHeight: null });
  });

  it("flips above when it does not fit below", () => {
    expect(translationAnchoredPosition(rect(100, 600, 200, 30), { width: 300, height: 150 }, viewport)).toEqual({ top: 440, left: 100, maxHeight: null });
  });

  it("caps the height on the larger side when neither fits", () => {
    const placement = translationAnchoredPosition(rect(100, 300, 200, 30), { width: 300, height: 600 }, viewport);
    expect(placement).toEqual({ top: 340, left: 100, maxHeight: 448 });
  });

  it("keeps the popup inside the viewport horizontally", () => {
    expect(translationAnchoredPosition(rect(1100, 100, 50, 30), { width: 300, height: 150 }, viewport).left).toBe(888);
    expect(translationAnchoredPosition(rect(0, 100, 50, 30), { width: 300, height: 150 }, viewport).left).toBe(12);
  });
});

describe("sheet placement", () => {
  const selection = rect(20, 500, 200, 30);

  it("keeps the bottom sheet when it clears the selection, else tries the top", () => {
    expect(sheetClearsBelow(selection, { top: 540 })).toBe(true);
    expect(sheetClearsBelow(selection, { top: 535 })).toBe(false);
    expect(sheetClearsAbove(selection, { bottom: 490 })).toBe(true);
    expect(sheetClearsAbove(selection, { bottom: 495 })).toBe(false);
  });

  it("falls back to the roomier side with a capped height", () => {
    expect(sheetFallback(selection, { bottom: 790 }, { top: 10 })).toEqual({ dockTop: true, maxHeight: 480 });
    expect(sheetFallback(rect(20, 100, 200, 30), { bottom: 790 }, { top: 10 })).toEqual({ dockTop: false, maxHeight: 650 });
  });
});

describe("unionRect", () => {
  it("spans every rectangle", () => {
    expect(unionRect([rect(10, 10, 20, 20), rect(50, 40, 10, 10)])).toEqual(rect(10, 10, 50, 40));
    expect(unionRect([])).toBeNull();
  });
});
