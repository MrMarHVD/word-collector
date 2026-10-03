/**
 * Pure Library logic: the row placeholder letter, reading progress and the
 * drag data type shared with the category sidebar (contract C4).
 */

/** dataTransfer type a dragged work row carries (its id as a string); the category sidebar's drop targets read it. */
export const MATERIAL_DRAG_TYPE = "application/x-word-marker-material";

/** How long (ms) a go-to highlight outline stays before it fades. */
export const LIBRARY_FOCUS_OUTLINE_MS = 2200;

const segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;

/** First user-perceived character of a title, uppercased where the script has case ("" for an empty title). */
export function firstGrapheme(title: string): string {
  const trimmed = title.trim();
  const first = segmenter ? (segmenter.segment(trimmed)[Symbol.iterator]().next().value?.segment ?? "") : (Array.from(trimmed)[0] ?? "");
  return first.toLocaleUpperCase();
}

/** Reading progress as a whole percent (0 when the work has no tokens yet). */
export function readingPercent(readTokens: number, totalTokens: number): number {
  return totalTokens > 0 ? Math.min(100, Math.round((readTokens / totalTokens) * 100)) : 0;
}
