/**
 * @fileoverview Imports feature controller — manages the CSV word-list upload
 * modal. Handles target selection (new collection vs. existing collection),
 * populates the existing-collection dropdown from dashboard state, parses the
 * uploaded CSV client-side before submitting, and navigates to the collections
 * tab on successful import.
 */

import { requestJson } from "../../api.js";
import { navigateToTab } from "../../app/router.js";
import { parseCsv } from "../../csv.js";
import { elements } from "../../dom.js";
import { formatCount, t } from "../../i18n.js";
import { escapeHtml } from "../../shared/html.js";
import { state } from "../../state.js";

let loadDashboard = async () => {};

/**
 * Injects dependencies that the imports controller needs but cannot import
 * directly (to avoid circular module dependencies).
 *
 * @param {{ loadDashboard: function(): Promise<void> }} options
 * @param {function(): Promise<void>} options.loadDashboard - Reloads dashboard
 *   data after a successful import so collection counts are up to date.
 */
export function configureImportsController(options) {
  loadDashboard = options.loadDashboard;
}

let uploadTarget = "new";

function setUploadTarget(target) {
  uploadTarget = target === "existing" ? "existing" : "new";
  elements.uploadTargetButtons.forEach((button) => {
    const active = button.dataset.uploadTarget === uploadTarget;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  const usingExisting = uploadTarget === "existing";
  elements.uploadNewCollectionField.hidden = usingExisting;
  elements.uploadExistingCollectionField.hidden = !usingExisting;
  elements.collectionName.required = !usingExisting;
  elements.uploadCollectionSelect.required = usingExisting;
}

function populateExistingCollections() {
  const collections = state.dashboard?.collections || [];
  elements.uploadCollectionSelect.innerHTML = collections.length
    ? collections
        .map((collection) => `<option value="${collection.id}">${escapeHtml(collection.name)}</option>`)
        .join("")
    : `<option value="">${escapeHtml(t("collections.noCollections"))}</option>`;
  const existingButton = Array.from(elements.uploadTargetButtons).find((button) => button.dataset.uploadTarget === "existing");
  existingButton?.toggleAttribute("disabled", !collections.length);
}

function openUploadModal() {
  populateExistingCollections();
  const hasExisting = (state.dashboard?.collections || []).length > 0;
  setUploadTarget(hasExisting ? uploadTarget : "new");
  elements.uploadModal.hidden = false;
  elements.uploadModal.classList.remove("hidden");
  elements.uploadModal.classList.add("flex");
  (uploadTarget === "existing" ? elements.uploadCollectionSelect : elements.collectionName)?.focus();
}

function closeUploadModal() {
  elements.uploadModal.hidden = true;
  elements.uploadModal.classList.add("hidden");
  elements.uploadModal.classList.remove("flex");
  elements.uploadStatus.textContent = "";
}

/**
 * Attaches all DOM event listeners for the CSV import feature. Must be called
 * once during application bootstrap.
 *
 * Registered interactions include:
 * - Upload-open button showing the modal.
 * - Modal close button and backdrop click hiding the modal.
 * - Escape key closing the modal when it is open.
 * - Upload-target toggle buttons switching between "new collection" and
 *   "existing collection" modes (the "existing" option is disabled when no
 *   collections exist).
 * - Upload form submission: reads and parses the selected CSV file via
 *   `parseCsv`, validates the target collection selection, then POSTs to
 *   `/api/import`. On success, selects the resulting collection, resets the
 *   search input, navigates to the collections tab, and reloads the dashboard.
 *
 * @sideeffects
 * - Adds event listeners on `elements.uploadOpenButton`,
 *   `elements.uploadModalClose`, `elements.uploadModal`,
 *   `elements.uploadTargetButtons`, `elements.uploadForm`, and `document`
 *   (for Escape key).
 * - On successful import: mutates `state.selectedCollectionId` and
 *   `state.search`, and updates `elements.searchInput.value`.
 */
export function bindImportEvents() {
  elements.uploadOpenButton.addEventListener("click", openUploadModal);
  elements.uploadModalClose.addEventListener("click", closeUploadModal);
  elements.uploadModal.addEventListener("click", (event) => {
    if (event.target === elements.uploadModal) {
      closeUploadModal();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.uploadModal.hidden) {
      closeUploadModal();
    }
  });
  elements.uploadTargetButtons.forEach((button) => {
    button.addEventListener("click", () => setUploadTarget(button.dataset.uploadTarget));
  });

  elements.uploadForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = elements.uploadForm.querySelector("button[type=submit]");
    submitButton.disabled = true;
    elements.uploadStatus.textContent = t("upload.inProgress");

    try {
      const file = elements.csvFile.files[0];
      const rows = parseCsv(await file.text());
      const payload = {
        languageId: Number(state.selectedStudyLanguageId),
        words: rows
      };
      if (uploadTarget === "existing") {
        const id = Number(elements.uploadCollectionSelect.value);
        if (!id) {
          elements.uploadStatus.textContent = t("upload.selectCollection");
          submitButton.disabled = false;
          return;
        }
        payload.collectionId = id;
      } else {
        payload.collectionName = elements.collectionName.value;
      }

      const result = await requestJson("/api/import", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      state.selectedCollectionId = result.collection.id;
      state.search = "";
      navigateToTab("collections");
      elements.searchInput.value = "";
      elements.uploadStatus.textContent = t("upload.result", {
        inserted: formatCount(result.inserted),
        skipped: formatCount(result.skipped)
      });
      elements.uploadForm.reset();
      await loadDashboard();
      closeUploadModal();
    } catch (error) {
      elements.uploadStatus.textContent = error.message;
    } finally {
      submitButton.disabled = false;
    }
  });
}
