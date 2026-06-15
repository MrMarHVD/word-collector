/**
 * @fileoverview Settings feature controller — manages the settings panel tabs
 * (account details, native language, change password, and account deletion).
 * Handles form submissions for password change, account deletion (with email-
 * address confirmation), and general settings (native language). Orchestrates
 * cleanup after deletion and falls back the study language when the current
 * selection is no longer available after a settings save.
 */

import { requestJson } from "../../api.js";
import { availableStudyLanguages, firstAvailableStudyLanguageAlphabetically, setStudyLanguage, studyLanguageLabel } from "../../app/study-language.js";
import { elements } from "../../dom.js";
import { t } from "../../i18n.js";
import { escapeHtml } from "../../shared/html.js";
import { state } from "../../state.js";
import { renderVerifyBanner } from "../../views/auth.js";
import { showView } from "../../views/shell.js";

let reloadDashboard = async () => {};

/**
 * Injects dependencies that the settings controller needs but cannot import
 * directly (to avoid circular module dependencies).
 *
 * @param {{ reloadDashboard: function(): Promise<void> }} options
 * @param {function(): Promise<void>} options.reloadDashboard - Application-
 *   level function to reload dashboard data after a settings save that may
 *   have changed the active study language.
 */
export function configureSettingsController(options) {
  reloadDashboard = options.reloadDashboard;
}

function formatAccountDate(value) {
  if (!value) {
    return t("settings.accountUnknown");
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return t("settings.accountUnknown");
  }
  return new Intl.DateTimeFormat(state.locale, { dateStyle: "medium" }).format(date);
}

function renderAccountDetails() {
  const user = state.user || {};
  const rows = [
    ["settings.accountEmail", user.email || t("settings.accountUnknown")],
    ["settings.accountName", user.displayName || t("settings.accountNotProvided")],
    ["settings.accountCreatedAt", formatAccountDate(user.createdAt)],
    ["settings.accountSignInMethods", [user.hasGoogle ? t("settings.accountGoogle") : "", user.hasPassword ? t("settings.accountPassword") : ""].filter(Boolean).join(", ") || t("settings.accountUnknown")],
    ["settings.accountEmailVerified", user.emailVerified === true ? t("settings.accountVerified") : t("settings.accountNotVerified")]
  ];
  elements.accountDetails.innerHTML = rows
    .map(([labelKey, value]) => `
      <div class="grid gap-1 rounded-md border border-line bg-muted px-3 py-2">
        <dt class="text-xs font-semibold uppercase text-secondary">${escapeHtml(t(labelKey))}</dt>
        <dd class="break-words font-semibold text-main">${escapeHtml(value)}</dd>
      </div>
    `)
    .join("");
}

function deleteConfirmationMatches() {
  const email = String(state.user?.email || "").toLowerCase();
  const confirmation = String(elements.deleteAccountConfirmation.value || "").trim().toLowerCase();
  return Boolean(email) && confirmation === email;
}

function renderDeleteAccountState() {
  elements.deleteAccountSubmit.disabled = !deleteConfirmationMatches();
}

function clearDeletedAccountState() {
  state.user = null;
  state.csrfToken = null;
  state.languages = [];
  state.dashboard = null;
  state.words = [];
  state.materials = [];
  state.readerTokens = [];
  state.readerFetchedTokens = [];
  state.selectedStudyLanguageId = null;
  state.selectedStudyLanguageName = "";
  state.selectedCollectionId = "all";
  state.selectedMaterialId = null;
  localStorage.removeItem("wordMarkerStudyLanguageName");
}

/**
 * Synchronises the settings sidebar tab buttons and panel visibility with
 * `state.settingsTab`. The active tab button receives `is-active` and
 * `aria-current="page"`; inactive tabs are set to `aria-current="false"`.
 *
 * @sideeffects
 * - Toggles `is-active` and sets `aria-current` on each
 *   `elements.settingsMenuButtons` entry.
 * - Sets `hidden` on each `elements.settingsPanels` entry so only the active
 *   panel is visible.
 */
export function renderSettingsTabs() {
  elements.settingsMenuButtons.forEach((button) => {
    const active = button.dataset.settingsTab === state.settingsTab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-current", active ? "page" : "false");
  });
  elements.settingsPanels.forEach((panel) => {
    panel.hidden = panel.dataset.settingsPanel !== state.settingsTab;
  });
}

/**
 * Performs a full re-render of the settings panel. Populates the native
 * language dropdown, renders the account details table, resets the account-
 * deletion form and status, and hides the password-change form. Also hides the
 * change-password section entirely when the user has no password auth method.
 *
 * No-ops early for the native language dropdown when the element is absent
 * (e.g. in stripped-down views).
 *
 * @sideeffects
 * - Calls {@link renderSettingsTabs}.
 * - Replaces `elements.nativeLanguageSelect.innerHTML`.
 * - Replaces `elements.accountDetails.innerHTML` (via internal helper).
 * - Resets `elements.deleteAccountForm` and clears `elements.deleteAccountStatus`.
 * - Sets `hidden` and `aria-expanded` on the delete-account and change-password
 *   toggle sections.
 * - Conditionally shows or hides `elements.changePasswordSection`.
 */
export function renderSettings() {
  renderSettingsTabs();
  if (!elements.nativeLanguageSelect) {
    return;
  }
  elements.nativeLanguageSelect.innerHTML = state.nativeLanguageOptions
    .map((language) => {
      const selected = language === state.user?.nativeLanguage ? "selected" : "";
      return `<option value="${escapeHtml(language)}" ${selected}>${escapeHtml(t(`settings.nativeLanguage.${language}`))}</option>`;
    })
    .join("");
  renderAccountDetails();
  elements.deleteAccountForm.reset();
  elements.deleteAccountStatus.textContent = "";
  elements.deleteAccountPanel.hidden = true;
  elements.deleteAccountToggle.setAttribute("aria-expanded", "false");
  renderDeleteAccountState();
  elements.changePasswordSection.hidden = state.user?.hasPassword !== true;
  elements.changePasswordForm.hidden = true;
  elements.changePasswordToggle.setAttribute("aria-expanded", "false");
  if (state.user?.hasPassword === true && elements.changePasswordStatus.textContent === t("settings.passwordUnavailable")) {
    elements.changePasswordStatus.textContent = "";
  }
}

/**
 * Attaches all DOM event listeners for the settings panel. Must be called once
 * during application bootstrap.
 *
 * Registered interactions include:
 * - Settings tab navigation via `elements.settingsMenu`.
 * - Change-password accordion toggle and form submission. POSTs to
 *   `/api/settings/password`; shows inline status feedback.
 * - Account-deletion accordion toggle, confirmation input validation, and
 *   form submission. DELETEs `/api/settings/account`; on success clears all
 *   user state and navigates to the welcome view.
 * - General settings form submission (native language). PATCHes `/api/settings`;
 *   falls back the study language when the current selection is no longer
 *   available after the save.
 *
 * @sideeffects
 * - Adds event listeners on `elements.settingsMenu`,
 *   `elements.changePasswordToggle`, `elements.changePasswordForm`,
 *   `elements.deleteAccountToggle`, `elements.deleteAccountConfirmation`,
 *   `elements.deleteAccountForm`, and `elements.settingsForm`.
 */
export function bindSettingsEvents() {
  elements.settingsMenu.addEventListener("click", (event) => {
    const button = event.target.closest("[data-settings-tab]");
    if (!button) {
      return;
    }
    state.settingsTab = button.dataset.settingsTab;
    renderSettingsTabs();
  });

  elements.changePasswordToggle.addEventListener("click", () => {
    const expanded = elements.changePasswordToggle.getAttribute("aria-expanded") === "true";
    elements.changePasswordToggle.setAttribute("aria-expanded", String(!expanded));
    elements.changePasswordForm.hidden = expanded;
    if (!expanded) {
      elements.currentPassword.focus();
    }
  });

  elements.changePasswordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    elements.changePasswordStatus.textContent = t("settings.updatingPassword");
    const submitButton = elements.changePasswordForm.querySelector("button");
    submitButton.disabled = true;
    try {
      await requestJson("/api/settings/password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: elements.currentPassword.value,
          newPassword: elements.newPassword.value,
          confirmPassword: elements.confirmNewPassword.value
        })
      });
      elements.changePasswordForm.reset();
      elements.changePasswordStatus.textContent = t("settings.passwordUpdated");
    } catch (error) {
      elements.changePasswordStatus.textContent = error.message;
    } finally {
      submitButton.disabled = false;
    }
  });

  elements.deleteAccountToggle.addEventListener("click", () => {
    const expanded = elements.deleteAccountToggle.getAttribute("aria-expanded") === "true";
    elements.deleteAccountToggle.setAttribute("aria-expanded", String(!expanded));
    elements.deleteAccountPanel.hidden = expanded;
    if (!expanded) {
      elements.deleteAccountConfirmation.focus();
    }
  });

  elements.deleteAccountConfirmation.addEventListener("input", () => {
    elements.deleteAccountStatus.textContent = "";
    renderDeleteAccountState();
  });

  elements.deleteAccountForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!deleteConfirmationMatches()) {
      elements.deleteAccountStatus.textContent = t("errors.accountDeletionConfirmationMismatch");
      renderDeleteAccountState();
      return;
    }
    if (!window.confirm(t("settings.deleteAccountFinalConfirm"))) {
      renderDeleteAccountState();
      return;
    }
    elements.deleteAccountStatus.textContent = t("settings.deletingAccount");
    elements.deleteAccountSubmit.disabled = true;
    try {
      await requestJson("/api/settings/account", {
        method: "DELETE",
        body: JSON.stringify({ confirmation: elements.deleteAccountConfirmation.value })
      });
      elements.deleteAccountForm.reset();
      clearDeletedAccountState();
      renderVerifyBanner();
      showView("welcome");
    } catch (error) {
      elements.deleteAccountStatus.textContent = error.message;
      renderDeleteAccountState();
    }
  });

  elements.settingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    elements.settingsStatus.textContent = t("settings.saving");
    const submitButton = elements.settingsForm.querySelector("button");
    submitButton.disabled = true;
    try {
      const result = await requestJson("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({
          nativeLanguage: elements.nativeLanguageSelect.value,
          activeStudyLanguage: state.selectedStudyLanguageName
        })
      });
      state.user = result.user;
      state.nativeLanguageOptions = result.nativeLanguageOptions || state.nativeLanguageOptions;
      renderSettings();
      state.selectedMaterialId = null;
      state.currentMaterial = null;
      state.readerTokens = [];
      if (!availableStudyLanguages().some((language) => language.name === state.selectedStudyLanguageName)) {
        const replacement = firstAvailableStudyLanguageAlphabetically();
        await setStudyLanguage(replacement?.name || "", { persist: true, reload: false });
        elements.settingsStatus.textContent = replacement
          ? t("settings.savedStudyLanguageChanged", { language: studyLanguageLabel(replacement.name) })
          : t("settings.savedNoStudyLanguage");
      } else {
        elements.settingsStatus.textContent = t("settings.saved");
      }
      await reloadDashboard();
    } catch (error) {
      elements.settingsStatus.textContent = error.message;
    } finally {
      submitButton.disabled = false;
    }
  });
}
