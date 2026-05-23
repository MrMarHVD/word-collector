import { elements } from "../dom.js";
import { state } from "../state.js";
import { formatCount, t } from "../i18n.js";
import { escapeHtml } from "../shared/html.js";

// Render summary metrics, collection charts, and collection management controls.
// Render dashboard totals and collection selectors from state.dashboard.
export function renderDashboard() {
  const { totalWords, knownWords, collections, languages } = state.dashboard;
  const allCollections = collections;
  elements.knownTotal.textContent = formatCount(knownWords);
  elements.totalWords.textContent = formatCount(totalWords);
  elements.unknownTotal.textContent = formatCount(totalWords - knownWords);
  elements.collectionCount.textContent = formatCount(collections.length);

  elements.languageOptions.innerHTML = languages
    .map((language) => `<option value="${escapeHtml(language.name)}"></option>`)
    .join("");

  elements.collectionCharts.innerHTML = collections.length
    ? collections.map(renderChartCard).join("")
    : `<p class="empty">${escapeHtml(t("dashboard.noCollections"))}</p>`;

  elements.collectionSelect.innerHTML = allCollections.length
    ? allCollections
        .map((collection) => {
          const selected = collection.id === state.selectedCollectionId ? "selected" : "";
          return `<option value="${collection.id}" ${selected}>${escapeHtml(collection.languageName)} / ${escapeHtml(collection.name)}</option>`;
        })
        .join("")
    : `<option value="">${escapeHtml(t("collections.noCollections"))}</option>`;

  elements.collectionLanguageSelect.innerHTML = languages.length
    ? languages
        .map((language) => {
          const selected = language.id === getSelectedCollection()?.languageId ? "selected" : "";
          return `<option value="${language.id}" ${selected}>${escapeHtml(language.name)}</option>`;
        })
        .join("")
    : `<option value="">${escapeHtml(t("collections.noLanguages"))}</option>`;

  elements.deleteCollectionButton.disabled = !state.selectedCollectionId;
  elements.saveCollectionLanguageButton.disabled = !state.selectedCollectionId;
  renderSelectedCollectionStats();
}

// Return the currently selected collection from dashboard state.
export function getSelectedCollection() {
  const allCollections = state.dashboard?.allCollections || state.dashboard?.collections || [];
  return allCollections.find((entry) => entry.id === state.selectedCollectionId);
}

// Render progress metadata for the selected collection.
export function renderSelectedCollectionStats() {
  const collection = getSelectedCollection();
  if (!collection) {
    elements.selectedCollectionStats.innerHTML = "";
    elements.collectionLanguageSelect.value = "";
    return;
  }

  const percent = collection.totalWords ? Math.round((collection.knownWords / collection.totalWords) * 100) : 0;
  elements.collectionLanguageSelect.value = String(collection.languageId);
  elements.selectedCollectionStats.innerHTML = `
    <span>${escapeHtml(collection.name)}</span>
    <small>${escapeHtml(collection.languageName)}</small>
    <strong>${formatCount(collection.knownWords)} / ${formatCount(collection.totalWords)}</strong>
    <small>${escapeHtml(t("progress.knownPercent", { percent }))}</small>
  `;
}

// Render one collection progress chart card.
function renderChartCard(collection) {
  const percent = collection.totalWords ? Math.round((collection.knownWords / collection.totalWords) * 100) : 0;
  return `
    <article class="chart-card">
      <div class="pie" style="--knownPercent: ${percent}%"></div>
      <div>
        <strong>${escapeHtml(collection.name)}</strong>
        <span>${escapeHtml(collection.languageName)}</span>
        <span>${escapeHtml(t("progress.knownOfTotal", { total: formatCount(collection.totalWords), known: formatCount(collection.knownWords) }))}</span>
        <span>${escapeHtml(t("progress.complete", { percent }))}</span>
      </div>
    </article>
  `;
}
