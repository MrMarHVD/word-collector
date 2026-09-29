/**
 * Tab ↔ URL mapping and gating rules, ported from public/js/app/router.js.
 * Tab names are the legacy internal names (the vocab page is the
 * "collections" tab at /vocab).
 */

import { readStorage, writeStorage } from "@/lib/storage";

export const TABS = ["dashboard", "collections", "reader", "practice", "settings", "admin"] as const;
export type Tab = (typeof TABS)[number];

export const TAB_PATHS: Record<Tab, string> = {
  dashboard: "/dashboard",
  collections: "/vocab",
  reader: "/reader",
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

/** Tab for a URL path, or null for "/" and unknown paths. */
export function tabForPath(pathname: string): Tab | null {
  return (Object.keys(TAB_PATHS) as Tab[]).find((tab) => TAB_PATHS[tab] === pathname) ?? null;
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
