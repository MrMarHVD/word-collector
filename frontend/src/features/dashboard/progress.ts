/**
 * Pure dashboard rules ported from the legacy dashboard view and controller:
 * the stats-tab preference, progress-pie percentages, document card metadata
 * and the documents pagination cursor.
 */

import type { DashboardDocumentsResponse } from "@/lib/api";

export type DashboardStatsTab = "overview" | "documents";

/** localStorage key of the selected stats tab (legacy). */
export const DASHBOARD_STATS_TAB_KEY = "wordMarkerDashboardStatsTab";

/** Page size of GET /api/dashboard/documents (legacy DOCUMENT_STATS_PAGE_SIZE). */
export const DOCUMENT_STATS_PAGE_SIZE = 24;

/** Remaining scroll distance (px) of the documents pane that loads the next page. */
export const DOCUMENT_SCROLL_THRESHOLD = 140;

/** Parses the stored stats tab; anything but "documents" means "overview". */
export function parseDashboardStatsTab(stored: string | null): DashboardStatsTab {
  return stored === "documents" ? "documents" : "overview";
}

/** Word counts behind one progress card. */
export interface ProgressCounts {
  totalWords: number;
  knownWords: number;
  learningWords: number;
}

/**
 * Rounded pie stops: `knownPercent` ends the known slice and `learningPercent`
 * the learning slice (known + learning). Both are 0 without words.
 */
export function progressPercents({ totalWords, knownWords, learningWords }: ProgressCounts): { knownPercent: number; learningPercent: number } {
  if (!totalWords) {
    return { knownPercent: 0, learningPercent: 0 };
  }
  return {
    knownPercent: Math.round((knownWords / totalWords) * 100),
    learningPercent: Math.round(((knownWords + learningWords) / totalWords) * 100)
  };
}

/** Document card subtitle: "<language> / <FILE TYPE>", skipping empty parts. */
export function documentMeta(document: { languageName?: string | null; fileType?: string | null }): string {
  return [document.languageName, String(document.fileType || "").toUpperCase()].filter(Boolean).join(" / ");
}

/**
 * Offset of the next documents page, or undefined when the last page was
 * short (legacy `hasMore = documents.length === pageSize`).
 */
export function nextDocumentsOffset(pages: DashboardDocumentsResponse[]): number | undefined {
  const lastPage = pages.at(-1);
  if (!lastPage || (lastPage.documents || []).length !== lastPage.pageSize) {
    return undefined;
  }
  return pages.reduce((offset, page) => offset + (page.documents || []).length, 0);
}

/** Whether a scrolled pane is within the threshold of its bottom. */
export function isNearScrollEnd({ scrollHeight, scrollTop, clientHeight }: { scrollHeight: number; scrollTop: number; clientHeight: number }): boolean {
  return scrollHeight - scrollTop - clientHeight < DOCUMENT_SCROLL_THRESHOLD;
}
