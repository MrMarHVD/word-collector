/**
 * Pure pagination rules for the reader (ported from reader.controller.js and
 * views/reader.js): the fetch size, page turns, the page status and progress,
 * and the "fit to page" search.
 */

import type { ReaderWordsPerPage } from "@/stores/reader-preferences";

/** Tokens fetched per page in "fit" mode; the fit search then trims them to what is visible. */
export const FIT_READER_FETCH_LIMIT = 1000;

export type PageDirection = "next" | "prev";

/** The `limit` requested from the API for a words-per-page preference. */
export function readerFetchLimit(wordsPerPage: ReaderWordsPerPage): number {
  return wordsPerPage === "fit" ? FIT_READER_FETCH_LIMIT : wordsPerPage;
}

export interface PageTurnInput {
  direction: PageDirection;
  /** First token offset of the current page. */
  start: number;
  /** Tokens shown on the current page. */
  visibleCount: number;
  /** Total tokens in the material. */
  wordCount: number;
  wordsPerPage: ReaderWordsPerPage;
}

/**
 * The start offset of the page in `direction`, or null when there is no such
 * page. In "fit" mode a page advances by the number of tokens shown.
 */
export function pageTurnStart({ direction, start, visibleCount, wordCount, wordsPerPage }: PageTurnInput): number | null {
  const pageStep = wordsPerPage === "fit" ? Math.max(visibleCount, 1) : Number(wordsPerPage);
  const canTurn = direction === "next" ? start + visibleCount < wordCount : start > 0;
  if (!canTurn) {
    return null;
  }
  return direction === "next" ? start + pageStep : Math.max(start - pageStep, 0);
}

export interface PageStatus {
  /** One-based first position shown. */
  first: number;
  /** Position of the last token shown. */
  end: number;
  total: number;
  prevDisabled: boolean;
  nextDisabled: boolean;
  /** Reading progress (0–100) at the end of this page. */
  progressPercent: number;
}

/** Page status text values, button states and progress for the current page. */
export function readerPageStatus(start: number, visibleCount: number, wordCount: number): PageStatus {
  const end = Math.min(start + visibleCount, wordCount || 0);
  return {
    first: start + 1,
    end,
    total: wordCount,
    prevDisabled: start <= 0,
    nextDisabled: end >= wordCount,
    progressPercent: wordCount > 0 ? Math.max(0, Math.min(100, Math.round((end / wordCount) * 100))) : 0
  };
}

/**
 * Binary-searches for the largest token count (at least 1) for which `fits`
 * holds, assuming that fitting is monotonic in the count.
 */
export function fitTokenCount(total: number, fits: (count: number) => boolean): number {
  let low = 1;
  let high = total;
  let best = 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (fits(mid)) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return best;
}
