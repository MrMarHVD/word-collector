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

export function bindImportEvents() {
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
    } catch (error) {
      elements.uploadStatus.textContent = error.message;
    } finally {
      submitButton.disabled = false;
    }
  });
}
