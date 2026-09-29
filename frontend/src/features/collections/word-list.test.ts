import { describe, expect, it } from "vitest";
import type { CollectionStats } from "@/lib/api/types";
import {
  dragSelection,
  knownPercent,
  normalizeStatus,
  parseCollectionSelection,
  parseDraggedWordIds,
  resolveCollectionSelection,
  selectRow,
  statusTargetIds,
  wordPhonetics,
  wordWindow
} from "./word-list";

const none = { ids: new Set<number>(), anchorId: null };
const plain = { shift: false, toggle: false };
const ORDER = [1, 2, 3, 4, 5];

function collection(id: number): CollectionStats {
  return { id, name: `c${id}`, languageId: 1, languageName: "Japanese", totalWords: 0, knownWords: 0, learningWords: 0, unknownWords: 0 };
}

describe("collection selection", () => {
  it("parses select and button values", () => {
    expect(parseCollectionSelection("all")).toBe("all");
    expect(parseCollectionSelection("12")).toBe(12);
  });

  it("falls back to all when the collection is not in the study language", () => {
    expect(resolveCollectionSelection(2, [collection(1), collection(2)])).toBe(2);
    expect(resolveCollectionSelection(3, [collection(1)])).toBe("all");
    expect(resolveCollectionSelection("all", [collection(1)])).toBe("all");
  });
});

describe("selectRow", () => {
  it("selects only the clicked row on a plain click", () => {
    const next = selectRow({ ids: new Set([1, 2]), anchorId: 1 }, ORDER, 3, plain);
    expect([...next.ids]).toEqual([3]);
    expect(next.anchorId).toBe(3);
  });

  it("toggles a row with Cmd/Ctrl and moves the anchor", () => {
    const added = selectRow({ ids: new Set([1]), anchorId: 1 }, ORDER, 3, { shift: false, toggle: true });
    expect([...added.ids].sort()).toEqual([1, 3]);
    expect(added.anchorId).toBe(3);
    const removed = selectRow(added, ORDER, 1, { shift: false, toggle: true });
    expect([...removed.ids]).toEqual([3]);
  });

  it("selects the range from the anchor with Shift, in either direction", () => {
    expect([...selectRow({ ids: new Set([2]), anchorId: 2 }, ORDER, 4, { shift: true, toggle: false }).ids]).toEqual([2, 3, 4]);
    expect([...selectRow({ ids: new Set([4]), anchorId: 4 }, ORDER, 1, { shift: true, toggle: false }).ids]).toEqual([1, 2, 3, 4]);
  });

  it("treats Shift without an anchor as a plain click", () => {
    expect([...selectRow(none, ORDER, 2, { shift: true, toggle: false }).ids]).toEqual([2]);
  });
});

describe("drag and status targets", () => {
  it("drags the whole selection when the row is selected, else just the row", () => {
    const selection = { ids: new Set([1, 2]), anchorId: 1 };
    expect(dragSelection(selection, 2).wordIds).toEqual([1, 2]);
    const single = dragSelection(selection, 4);
    expect(single.wordIds).toEqual([4]);
    expect([...single.selection.ids]).toEqual([4]);
  });

  it("parses the drop payload with a plain-text fallback", () => {
    expect(parseDraggedWordIds("[3,4]", "3")).toEqual([3, 4]);
    expect(parseDraggedWordIds("", "7")).toEqual([7]);
    expect(parseDraggedWordIds("", "")).toEqual([]);
    expect(parseDraggedWordIds('{"a":1}', "")).toEqual([]);
  });

  it("applies a status to the multi-selection only when the word is part of it", () => {
    expect(statusTargetIds(new Set([1, 2]), 2)).toEqual([1, 2]);
    expect(statusTargetIds(new Set([1, 2]), 3)).toEqual([3]);
    expect(statusTargetIds(new Set([2]), 2)).toEqual([2]);
  });
});

describe("wordWindow", () => {
  it("pages by ten and clamps the page", () => {
    expect(wordWindow(25, "page", 1, 50)).toEqual({ start: 10, end: 20, page: 1, totalPages: 3 });
    expect(wordWindow(25, "page", 9, 50)).toEqual({ start: 20, end: 25, page: 2, totalPages: 3 });
    expect(wordWindow(0, "page", 0, 50)).toEqual({ start: 0, end: 0, page: 0, totalPages: 1 });
  });

  it("shows the growing window in infinite mode", () => {
    expect(wordWindow(120, "infinite", 3, 50)).toEqual({ start: 0, end: 50, page: 0, totalPages: 1 });
    expect(wordWindow(30, "infinite", 0, 50).end).toBe(30);
  });
});

describe("display helpers", () => {
  it("joins reading, pinyin and a differing traditional form", () => {
    expect(wordPhonetics({ word: "学", reading: null, pinyin: "xué", traditional: "學" })).toBe("xué · 學");
    expect(wordPhonetics({ word: "学", reading: "がく", pinyin: null, traditional: "学" })).toBe("がく");
  });

  it("rounds the known share", () => {
    expect(knownPercent(1, 3)).toBe(33);
    expect(knownPercent(0, 0)).toBe(0);
  });

  it("normalises unexpected statuses to unknown", () => {
    expect(normalizeStatus("known")).toBe("known");
    expect(normalizeStatus("bogus")).toBe("unknown");
  });
});
