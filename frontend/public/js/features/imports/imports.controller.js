import { requestJson } from "../../api.js";
import { parseCsv } from "../../csv.js";
import { elements } from "../../dom.js";
import { formatCount, t } from "../../i18n.js";
import { state } from "../../state.js";

let loadDashboard = async () => {};
let activateTab = () => {};

export function configureImportsController(options) {
  loadDashboard = options.loadDashboard;
  activateTab = options.activateTab;
}

function openUploadModal() {
  elements.uploadModal.hidden = false;
  elements.uploadModal.classList.remove("hidden");
  elements.uploadModal.classList.add("flex");
  elements.collectionName?.focus();
}

function closeUploadModal() {
  elements.uploadModal.hidden = true;
  elements.uploadModal.classList.add("hidden");
  elements.uploadModal.classList.remove("flex");
  elements.uploadStatus.textContent = "";
}

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

  elements.uploadForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = elements.uploadForm.querySelector("button");
    submitButton.disabled = true;
    elements.uploadStatus.textContent = t("upload.inProgress");

    try {
      const file = elements.csvFile.files[0];
      const rows = parseCsv(await file.text());
      const result = await requestJson("/api/import", {
        method: "POST",
        body: JSON.stringify({
          collectionName: elements.collectionName.value,
          languageId: Number(state.selectedStudyLanguageId),
          words: rows
        })
      });

      state.selectedCollectionId = result.collection.id;
      state.search = "";
      activateTab("collections");
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
