import { elements } from "../dom.js";
import { state, WORD_PAGE_SIZE } from "../state.js";

// Shell helpers switch top-level views and keep tab state persisted.
// Activate one app tab and persist it for the next load.
export function setActiveTab(tabName) {
  state.activeTab = tabName;
  localStorage.setItem("wordMarkerActiveTab", tabName);
  document.body.classList.toggle("is-reader-active", tabName === "reader");
  document.body.classList.toggle("is-reader-focus", tabName === "reader" && state.readerFocusMode);
  if (tabName === "reader") {
    window.scrollTo(0, 0);
  }
  elements.welcomeView.hidden = true;
  elements.dashboardView.hidden = tabName !== "dashboard";
  elements.collectionsView.hidden = tabName !== "collections";
  elements.readerView.hidden = tabName !== "reader";
  elements.practiceView.hidden = tabName !== "practice";
  elements.settingsView.hidden = tabName !== "settings";
  elements.tabButtons.forEach((button) => {
    const active = button.dataset.tab === tabName;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
}

// Show one top-level shell: auth, onboarding, welcome, or app.
export function showView(viewName) {
  if (viewName !== "app") {
    document.body.classList.remove("is-reader-active");
  }
  elements.authView.hidden = viewName !== "auth";
  elements.onboardingView.hidden = viewName !== "onboarding";
  elements.appShell.hidden = viewName !== "app" && viewName !== "welcome";
  if (viewName === "welcome" || viewName === "app") {
    renderMenuForAuth(Boolean(state.user) || viewName === "app");
  }
  if (viewName === "welcome") {
    elements.welcomeActions.hidden = Boolean(state.user);
    elements.welcomeLanguageGate.hidden = !state.user || Boolean(state.selectedStudyLanguageId);
    elements.welcomeView.hidden = false;
    elements.dashboardView.hidden = true;
    elements.collectionsView.hidden = true;
    elements.readerView.hidden = true;
    elements.practiceView.hidden = true;
    elements.settingsView.hidden = true;
  }
}

// Toggle menu bar controls between the logged-out and logged-in layouts.
export function renderMenuForAuth(isLoggedIn) {
  const hasStudyLanguage = Boolean(state.selectedStudyLanguageId);
  const accountMenuUsesDropdown = window.matchMedia("(max-width: 760px)").matches;
  elements.menuTabs.hidden = !isLoggedIn || !hasStudyLanguage;
  elements.studyLanguageBar.hidden = !isLoggedIn;
  elements.settingsButton.hidden = !isLoggedIn;
  elements.logoutButton.hidden = !isLoggedIn;
  elements.accountSettingsButton.hidden = !accountMenuUsesDropdown;
  elements.accountDropdown.hidden = !isLoggedIn || accountMenuUsesDropdown;
  elements.settingsButton.setAttribute("aria-expanded", "false");
  elements.loginButton.hidden = isLoggedIn;
}

// Render active state for locale selection controls.
export function renderLocaleButtons() {
  elements.localeSelect.value = state.locale;
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
