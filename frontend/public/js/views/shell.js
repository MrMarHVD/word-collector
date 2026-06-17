/**
 * @fileoverview Shell view helpers that switch top-level views, manage the
 * active app tab, and keep related UI controls (nav tabs, menu bar, locale
 * selector, display-mode buttons, word window) in sync with application state.
 */

import { elements } from "../dom.js";
import { state, WORD_PAGE_SIZE } from "../state.js";

/**
 * Activates an app tab, persists the selection to localStorage, and shows or
 * hides the corresponding top-level view panel.
 *
 * @param {string} tabName - The tab identifier (e.g. `"dashboard"`,
 *   `"reader"`, `"practice"`, `"collections"`, `"settings"`).
 *
 * @sideeffects
 * - Updates `state.activeTab`.
 * - Writes `"wordMarkerActiveTab"` to `localStorage`.
 * - Toggles `is-reader-active` and `is-reader-focus` on `document.body`.
 * - Scrolls to the top of the page when the reader tab is selected.
 * - Shows or hides `elements.dashboardView`, `elements.collectionsView`,
 *   `elements.readerView`, `elements.practiceView`, and `elements.settingsView`.
 * - Toggles `is-active` on each nav tab button and sets `aria-selected`.
 */
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

/**
 * Shows one of the four top-level shells: `"auth"`, `"onboarding"`,
 * `"welcome"`, or `"app"`. Only the nominated shell is made visible; all
 * others are hidden.
 *
 * When `viewName` is `"welcome"`, the welcome view is shown with its
 * call-to-action and language-gate sections adjusted to match the current
 * authentication and study-language state.
 *
 * @param {"auth"|"onboarding"|"welcome"|"app"} viewName - The shell to display.
 *
 * @sideeffects
 * - Removes `is-reader-active` from `document.body` for any non-app view.
 * - Shows or hides `elements.authView`, `elements.onboardingView`, and
 *   `elements.appShell`.
 * - When showing `"welcome"` or `"app"`, calls {@link renderMenuForAuth}.
 * - When showing `"welcome"`, adjusts `elements.welcomeActions`,
 *   `elements.welcomeLanguageGate`, and all tab content panels.
 */
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

/**
 * Toggles the menu bar between its logged-out and logged-in layouts.
 *
 * On narrow viewports (≤ 760 px) the account dropdown is replaced by a
 * separate settings button. Visibility of all auth-related controls is derived
 * from `isLoggedIn` and `state.selectedStudyLanguageId`.
 *
 * @param {boolean} isLoggedIn - `true` when a session is active.
 *
 * @sideeffects
 * - Toggles `is-guest` class on `elements.menuBar`.
 * - Shows or hides `elements.menuTabs`, `elements.studyLanguageBar`,
 *   `elements.settingsButton`, `elements.logoutButton`,
 *   `elements.accountSettingsButton`, `elements.accountDropdown`, and
 *   `elements.loginButton`.
 * - Resets `aria-expanded` on `elements.settingsButton` to `"false"`.
 */
export function renderMenuForAuth(isLoggedIn) {
  const hasStudyLanguage = Boolean(state.selectedStudyLanguageId);
  const accountMenuUsesDropdown = window.matchMedia("(max-width: 760px)").matches;
  elements.menuBar.classList.toggle("is-guest", !isLoggedIn);
  elements.menuTabs.hidden = !isLoggedIn || !hasStudyLanguage;
  elements.studyLanguageBar.hidden = !isLoggedIn;
  elements.settingsButton.hidden = !isLoggedIn;
  elements.logoutButton.hidden = !isLoggedIn;
  elements.accountSettingsButton.hidden = !accountMenuUsesDropdown;
  elements.accountDropdown.hidden = !isLoggedIn || accountMenuUsesDropdown;
  elements.settingsButton.setAttribute("aria-expanded", "false");
  elements.loginButton.hidden = true;
}

/**
 * Synchronises the locale selector control with `state.locale`.
 *
 * @sideeffects
 * - Sets `elements.localeSelect.value` to `state.locale`.
 */
export function renderLocaleButtons() {
  elements.localeSelect.value = state.locale;
}

/**
 * Synchronises the word-list display-mode toggle buttons with
 * `state.wordDisplayMode`.
 *
 * @sideeffects
 * - Toggles `is-active` on each display-mode button and sets `aria-pressed`.
 */
export function renderDisplayModeButtons() {
  elements.displayModeButtons.forEach((button) => {
    const active = button.dataset.displayMode === state.wordDisplayMode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

/**
 * Resets the infinite-scroll word window back to the initial page size and
 * scrolls the word table back to the top. Call this before re-filtering or
 * switching collections so the user always starts from the beginning.
 *
 * @sideeffects
 * - Sets `state.visibleWordCount` to `WORD_PAGE_SIZE`.
 * - Sets `state.wordsPage` to `0`.
 * - Sets `elements.tableWrap.scrollTop` to `0`.
 */
export function resetWordWindow() {
  state.visibleWordCount = WORD_PAGE_SIZE;
  state.wordsPage = 0;
  elements.tableWrap.scrollTop = 0;
}
