/**
 * @fileoverview Client-side router for the Word Marker SPA.
 *
 * Maps tab names to URL paths and back, drives `pushState`/`replaceState` for
 * tab navigation, and listens for browser `popstate` events to handle back/
 * forward navigation. Tabs that require an active study language redirect to
 * the welcome screen when none is selected.
 *
 * Tab ↔ path mapping:
 *   - `dashboard`   ↔ `/dashboard`
 *   - `collections` ↔ `/vocab`
 *   - `reader`      ↔ `/reader`
 *   - `practice`    ↔ `/practice`
 *   - `settings`    ↔ `/settings`
 */

import { enterPracticeTab } from "../features/practice/practice.controller.js";
import { refreshCollectionsSidebar } from "../features/collections/collections.controller.js";
import { renderReaderSidebar } from "../views/reader.js";
import { setActiveTab, showView } from "../views/shell.js";
import { state } from "../state.js";

// Maps between internal tab names and their public URL paths.
const TAB_TO_PATH = {
  dashboard: "/dashboard",
  collections: "/vocab",
  reader: "/reader",
  practice: "/practice",
  settings: "/settings"
};
const PATH_TO_TAB = Object.fromEntries(Object.entries(TAB_TO_PATH).map(([tab, path]) => [path, tab]));
const DEFAULT_TAB = "dashboard";
const LANGUAGE_REQUIRED_TABS = new Set(["dashboard", "collections", "reader", "practice"]);

/**
 * Return the URL path for a named tab.
 *
 * Falls back to the default tab path (`/dashboard`) for unknown tab names.
 *
 * @param {string} tabName - Internal tab identifier, e.g. `"collections"`.
 * @returns {string} URL path, e.g. `"/vocab"`.
 */
// Return the URL path for a tab, falling back to the default.
export function pathForTab(tabName) {
  return TAB_TO_PATH[tabName] || TAB_TO_PATH[DEFAULT_TAB];
}

/**
 * Return the tab identifier for a URL pathname, or `null` for unknown paths.
 *
 * @param {string} pathname - URL pathname, e.g. `"/vocab"`.
 * @returns {string|null} Tab name, e.g. `"collections"`, or `null`.
 */
// Return the tab for a URL path, or null when the path is not a known route.
export function tabForPath(pathname) {
  return PATH_TO_TAB[pathname] || null;
}

function renderReaderSidebarAfterLayout() {
  requestAnimationFrame(() => requestAnimationFrame(renderReaderSidebar));
}

function refreshCollectionsSidebarAfterLayout() {
  requestAnimationFrame(() => requestAnimationFrame(refreshCollectionsSidebar));
}

/**
 * Activate a tab and run its associated side effects without changing the URL.
 *
 * Side effects: the reader sidebar is re-rendered after layout for `"reader"`;
 * the collections reopen button is re-aligned after layout for `"collections"`;
 * `enterPracticeTab` is called for `"practice"`.
 *
 * @param {string} tabName - Internal tab identifier.
 * @returns {void}
 */
// Activate a tab and run its side effects. Does not change the URL.
export function activateTab(tabName) {
  setActiveTab(tabName);
  if (tabName === "reader") {
    renderReaderSidebarAfterLayout();
  } else if (tabName === "collections") {
    refreshCollectionsSidebarAfterLayout();
  } else if (tabName === "practice") {
    enterPracticeTab();
  }
}

/**
 * Navigate to a tab by updating the browser history entry and activating the tab.
 *
 * Redirects to the welcome screen (without a history entry) when the tab
 * requires an active study language and none is selected. Skips the history
 * push when the URL is already correct.
 *
 * @param {string} tabName - Internal tab identifier to navigate to.
 * @param {{ replace?: boolean }} [options]
 *   - `replace` (default `false`) — use `replaceState` instead of `pushState`.
 * @returns {void}
 */
// Navigate to a tab: update the URL history and activate it.
export function navigateToTab(tabName, { replace = false } = {}) {
  if (LANGUAGE_REQUIRED_TABS.has(tabName) && !state.selectedStudyLanguageId) {
    if (window.location.pathname !== "/") {
      window.history.replaceState({}, "", "/");
    }
    showView("welcome");
    return;
  }
  const path = pathForTab(tabName);
  if (window.location.pathname !== path) {
    const historyState = { tab: tabName };
    if (replace) {
      window.history.replaceState(historyState, "", path);
    } else {
      window.history.pushState(historyState, "", path);
    }
  }
  activateTab(tabName);
}

/**
 * Determine which tab to show on initial load.
 *
 * Resolution order: current URL path → persisted `state.activeTab` → `"dashboard"`.
 *
 * @returns {string} Tab name to activate.
 */
// Resolve which tab to show, preferring the current URL then the saved tab.
export function resolveInitialTab() {
  return tabForPath(window.location.pathname) || state.activeTab || DEFAULT_TAB;
}

/**
 * Attach the `popstate` listener that handles browser back/forward navigation.
 *
 * Silently ignores `popstate` events fired before a user session exists. When
 * a language-required tab is popped without an active study language, falls back
 * to the welcome screen.
 *
 * Should be called once during application bootstrap.
 *
 * @returns {void}
 */
// Listen for browser back/forward navigation between routes.
export function startRouter() {
  window.addEventListener("popstate", () => {
    if (!state.user) {
      return;
    }
    const tab = tabForPath(window.location.pathname) || DEFAULT_TAB;
    if (LANGUAGE_REQUIRED_TABS.has(tab) && !state.selectedStudyLanguageId) {
      showView("welcome");
      return;
    }
    activateTab(tab);
  });
}

export { showView };
