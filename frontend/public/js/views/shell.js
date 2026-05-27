import { elements } from "../dom.js";
import { state, WORD_PAGE_SIZE } from "../state.js";

// Shell helpers switch top-level views and keep tab state persisted.
// Activate one app tab and persist it for the next load.
export function setActiveTab(tabName) {
  state.activeTab = tabName;
  localStorage.setItem("wordMarkerActiveTab", tabName);
  elements.dashboardView.hidden = tabName !== "dashboard";
  elements.collectionsView.hidden = tabName !== "collections";
  elements.readerView.hidden = tabName !== "reader";
  elements.settingsView.hidden = tabName !== "settings";
  elements.pageHead.hidden = tabName === "reader";
  elements.tabButtons.forEach((button) => {
    const active = button.dataset.tab === tabName;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
}

// Show one top-level shell: auth, onboarding, or app.
export function showView(viewName) {
  elements.authView.hidden = viewName !== "auth";
  elements.onboardingView.hidden = viewName !== "onboarding";
  elements.appShell.hidden = viewName !== "app";
}

// Render active state for locale selection controls.
export function renderLocaleButtons() {
  elements.localeButtons.forEach((button) => {
    const active = button.dataset.locale === state.locale;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

// Render active state for collection word display mode controls.
export function renderDisplayModeButtons() {
  elements.displayModeButtons.forEach((button) => {
    const active = button.dataset.displayMode === state.wordDisplayMode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

// Reset the visible word window and table scroll position.
export function resetWordWindow() {
  state.visibleWordCount = WORD_PAGE_SIZE;
  state.wordsPage = 0;
  elements.tableWrap.scrollTop = 0;
}
