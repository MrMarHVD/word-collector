/**
 * Tab ↔ URL mapping and gating rules, ported from public/js/app/router.js.
 * Tab names are the legacy internal names (the vocab page is the
 * "collections" tab at /vocab).
 */

import type { LibraryCategory } from "@/lib/api/types";
import { readStorage, writeStorage } from "@/lib/storage";

export const TABS = ["dashboard", "collections", "reader", "practice", "settings", "admin"] as const;
export type Tab = (typeof TABS)[number];

export const TAB_PATHS: Record<Tab, string> = {
  dashboard: "/dashboard",
  collections: "/vocab",
  reader: "/library",
  practice: "/practice",
  settings: "/settings",
  admin: "/admin"
};

export const DEFAULT_TAB: Tab = "dashboard";

/** Tabs that need an active study language; without one they fall back to the welcome language gate. */
export const LANGUAGE_REQUIRED_TABS: ReadonlySet<Tab> = new Set(["dashboard", "collections", "reader", "practice"]);

export const ACTIVE_TAB_STORAGE_KEY = "wordMarkerActiveTab";

// The legacy app only restores these; a saved "admin" falls back to the dashboard.
const RESTORABLE_TABS: ReadonlySet<string> = new Set(["dashboard", "collections", "reader", "practice", "settings"]);

/** URL path of a tab. */
export function pathForTab(tab: Tab): string {
  return TAB_PATHS[tab];
}

/** Base path of the Reader route; the open work follows as /reader/:materialId. */
export const READER_PATH = "/reader";

/** URL of the Reader for one work. */
export function readerPath(materialId: number): string {
  return `${READER_PATH}/${materialId}`;
}

/** True for /reader and /reader/*. */
export function isReaderPath(pathname: string): boolean {
  return pathname === READER_PATH || pathname.startsWith(`${READER_PATH}/`);
}

/**
 * Tab for a URL path, or null for "/" and unknown paths. The single "reader"
 * tab (labelled Read) covers both the Library (/library) and the Reader (/reader/*).
 */
export function tabForPath(pathname: string): Tab | null {
  if (isReaderPath(pathname)) {
    return "reader";
  }
  return (Object.keys(TAB_PATHS) as Tab[]).find((tab) => TAB_PATHS[tab] === pathname) ?? null;
}

/** State carried by the Library's search params (contract C2). */
export interface LibraryAddress {
  category?: LibraryCategory;
  /** Search text. */
  q?: string;
  /** Dashboard "go to" target: the work to scroll into view and outline. */
  focus?: number;
}

/** Parses a `category` search param; anything but "uncategorised" or a positive integer id means "all". */
export function parseLibraryCategory(value: string | null): LibraryCategory {
  if (value === "uncategorised") {
    return "uncategorised";
  }
  const id = Number(value);
  return value !== null && Number.isInteger(id) && id > 0 ? id : "all";
}

/** Reads the Library address from search params (a missing or invalid `focus` is undefined). */
export function parseLibraryAddress(params: URLSearchParams): Required<Pick<LibraryAddress, "category" | "q">> & Pick<LibraryAddress, "focus"> {
  const focus = Number(params.get("focus"));
  return {
    category: parseLibraryCategory(params.get("category")),
    q: params.get("q") ?? "",
    focus: Number.isInteger(focus) && focus > 0 ? focus : undefined
  };
}

/** Library URL for an address; defaults (category all, empty search, no focus) are omitted. */
export function libraryPath({ category = "all", q = "", focus }: LibraryAddress = {}): string {
  const params = new URLSearchParams();
  if (category !== "all") {
    params.set("category", String(category));
  }
  if (q) {
    params.set("q", q);
  }
  if (focus !== undefined) {
    params.set("focus", String(focus));
  }
  const query = params.toString();
  return query ? `${TAB_PATHS.reader}?${query}` : TAB_PATHS.reader;
}

/** Last visited tab (wordMarkerActiveTab), used when landing on "/" or an unknown path. */
export function readSavedTab(): Tab {
  const saved = readStorage(ACTIVE_TAB_STORAGE_KEY);
  return saved && RESTORABLE_TABS.has(saved) ? (saved as Tab) : DEFAULT_TAB;
}

/** Persists the active tab, as the legacy setActiveTab did on every tab switch. */
export function saveActiveTab(tab: Tab): void {
  writeStorage(ACTIVE_TAB_STORAGE_KEY, tab);
}
