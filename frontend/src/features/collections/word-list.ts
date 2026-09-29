/**
 * Pure vocab-table logic ported from public/js/features/collections and
 * public/js/views/words.js: collection selection, row selection, drag
 * payloads, bulk-status targets, the paged/infinite word window and the
 * per-word display fields.
 */

import type { CollectionStats, Word, WordStatus } from "@/lib/api/types";

/** The selected collection: a collection id, or "all" for every word of the study language. */
export type CollectionSelection = "all" | number;

/** Words shown per page in the paged display mode. */
export const WORDS_PER_PAGE = 10;

/** Initial window, and the step it grows by, in the infinite-scroll display mode. */
export const WORD_PAGE_SIZE = 50;

/** Remaining scroll distance (px) at which the infinite window grows. */
export const LOAD_MORE_THRESHOLD = 120;

/** Status segments, rendered left to right. */
export const WORD_STATUSES: WordStatus[] = ["unknown", "learning", "known"];

/** Coerces an unexpected status to "unknown", as the legacy status toggle does. */
export function normalizeStatus(value: string | null | undefined): WordStatus {
  return WORD_STATUSES.includes(value as WordStatus) ? (value as WordStatus) : "unknown";
}

/** Parses a collection id from a button or select value ("all" or a numeric id). */
export function parseCollectionSelection(value: string): CollectionSelection {
  return value === "all" ? "all" : Number(value);
}

/** Falls back to "all" when the selected collection is not among the study language's collections. */
export function resolveCollectionSelection(selection: CollectionSelection, collections: CollectionStats[]): CollectionSelection {
  if (selection === "all" || !collections.some((collection) => collection.id === selection)) {
    return "all";
  }
  return selection;
}

export interface RowSelection {
  ids: Set<number>;
  anchorId: number | null;
}

/**
 * Applies a row click to the selection: Shift selects the range from the
 * anchor, Cmd/Ctrl toggles the row, and a plain click selects only the row.
 * `orderedIds` is the full filtered word list, not only the visible window.
 */
export function selectRow(selection: RowSelection, orderedIds: number[], wordId: number, modifiers: { shift: boolean; toggle: boolean }): RowSelection {
  if (modifiers.shift && selection.anchorId != null) {
    const anchorIndex = orderedIds.indexOf(selection.anchorId);
    const currentIndex = orderedIds.indexOf(wordId);
    if (anchorIndex < 0 || currentIndex < 0) {
      return selection;
    }
    const [from, to] = anchorIndex <= currentIndex ? [anchorIndex, currentIndex] : [currentIndex, anchorIndex];
    return { ids: new Set(orderedIds.slice(from, to + 1)), anchorId: selection.anchorId };
  }
  if (modifiers.toggle) {
    const ids = new Set(selection.ids);
    if (ids.has(wordId)) {
      ids.delete(wordId);
    } else {
      ids.add(wordId);
    }
    return { ids, anchorId: wordId };
  }
  return { ids: new Set([wordId]), anchorId: wordId };
}

/** Words a drag moves: the whole selection when the dragged row is part of it, else just that row (which becomes the selection). */
export function dragSelection(selection: RowSelection, draggedId: number): { wordIds: number[]; selection: RowSelection } {
  if (selection.ids.has(draggedId)) {
    return { wordIds: Array.from(selection.ids), selection };
  }
  return { wordIds: [draggedId], selection: { ids: new Set([draggedId]), anchorId: draggedId } };
}

/** Reads the dragged word ids from the drop payload, falling back to the plain-text single id. */
export function parseDraggedWordIds(payload: string, fallback: string): number[] {
  try {
    const parsed: unknown = JSON.parse(payload);
    return Array.isArray(parsed) ? parsed.map(Number) : [];
  } catch {
    const id = Number(fallback);
    return fallback && Number.isFinite(id) ? [id] : [];
  }
}

/** Words a status click applies to: the whole multi-selection when the clicked word is in it, else just that word. */
export function statusTargetIds(selectedIds: Set<number>, wordId: number): number[] {
  return selectedIds.has(wordId) && selectedIds.size > 1 ? Array.from(selectedIds) : [wordId];
}

export interface WordWindow {
  /** Slice bounds into the full word list. */
  start: number;
  end: number;
  /** Current page (clamped) and page count; 1 page in infinite mode. */
  page: number;
  totalPages: number;
}

/** The visible slice of the word list for the paged or infinite display mode. */
export function wordWindow(total: number, mode: "page" | "infinite", page: number, visibleCount: number): WordWindow {
  if (mode !== "page") {
    return { start: 0, end: Math.min(visibleCount, total), page: 0, totalPages: 1 };
  }
  const totalPages = Math.max(1, Math.ceil(total / WORDS_PER_PAGE));
  const current = Math.min(Math.max(page, 0), totalPages - 1);
  return { start: current * WORDS_PER_PAGE, end: Math.min((current + 1) * WORDS_PER_PAGE, total), page: current, totalPages };
}

/** Reading, pinyin and a differing traditional form, joined for the phonetic line. */
export function wordPhonetics(entry: Pick<Word, "word" | "reading" | "pinyin" | "traditional">): string {
  const phonetics: string[] = [];
  if (entry.reading) phonetics.push(entry.reading);
  if (entry.pinyin) phonetics.push(entry.pinyin);
  if (entry.traditional && entry.traditional !== entry.word) phonetics.push(entry.traditional);
  return phonetics.join(" · ");
}

/** Rounded share of known words, 0 for an empty collection. */
export function knownPercent(knownWords: number, totalWords: number): number {
  return totalWords ? Math.round((knownWords / totalWords) * 100) : 0;
}
