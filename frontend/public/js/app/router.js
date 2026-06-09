import { enterPracticeTab } from "../features/practice/practice.controller.js";
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

// Return the URL path for a tab, falling back to the default.
export function pathForTab(tabName) {
  return TAB_TO_PATH[tabName] || TAB_TO_PATH[DEFAULT_TAB];
}

// Return the tab for a URL path, or null when the path is not a known route.
export function tabForPath(pathname) {
  return PATH_TO_TAB[pathname] || null;
}

function renderReaderSidebarAfterLayout() {
  requestAnimationFrame(() => requestAnimationFrame(renderReaderSidebar));
}

// Activate a tab and run its side effects. Does not change the URL.
export function activateTab(tabName) {
  setActiveTab(tabName);
  if (tabName === "reader") {
    renderReaderSidebarAfterLayout();
  } else if (tabName === "practice") {
    enterPracticeTab();
  }
}

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

// Resolve which tab to show, preferring the current URL then the saved tab.
export function resolveInitialTab() {
  return tabForPath(window.location.pathname) || state.activeTab || DEFAULT_TAB;
}

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
