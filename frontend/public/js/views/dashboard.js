import { elements } from "../dom.js";
import { state } from "../state.js";
import { formatCount, t } from "../i18n.js";
import { escapeHtml } from "../shared/html.js";

// Render summary metrics, collection charts, and collection management controls.
// Render dashboard totals and collection selectors from state.dashboard.
export function renderDashboard() {
  const { totalWords, knownWords, learningWords, unknownWords, collections } = state.dashboard;
  elements.knownTotal.textContent = formatCount(knownWords);
  elements.totalWords.textContent = formatCount(totalWords);
  elements.learningTotal.textContent = formatCount(learningWords);
  elements.unknownTotal.textContent = formatCount(unknownWords);
  elements.collectionCount.textContent = formatCount(collections.length);

  elements.collectionCharts.innerHTML = collections.length
    ? collections.map(renderChartCard).join("")
    : `<p class="empty">${escapeHtml(t("dashboard.noCollections"))}</p>`;

  renderCollectionsList();
  renderSelectedCollectionStats();
}

// Render the sidebar list of collections, including the "All" entry.
export function renderCollectionsList() {
  if (!elements.collectionsList) {
    return;
  }
  const collections = state.dashboard?.collections || [];
  const allActive = state.selectedCollectionId === "all";
  const allButton = `
    <button class="collection-button${allActive ? " is-active" : ""} min-h-11 rounded-md border border-line bg-panel px-3 text-left text-sm font-semibold text-label hover:bg-hover"
      type="button" data-collection-id="all" aria-pressed="${allActive}">
      ${escapeHtml(t("collections.all"))}
    </button>
  `;
  const buttons = collections
    .map((collection) => {
      const active = collection.id === state.selectedCollectionId;
      return `
        <button class="collection-button${active ? " is-active" : ""} min-h-11 rounded-md border border-line bg-panel px-3 text-left text-sm font-semibold text-label hover:bg-hover"
          type="button" data-collection-id="${collection.id}" aria-pressed="${active}">
          ${escapeHtml(collection.name)}
        </button>
      `;
    })
    .join("");
  elements.collectionsList.innerHTML = allButton + buttons;
}

// Return the currently selected collection from dashboard state.
export function getSelectedCollection() {
  if (state.selectedCollectionId === "all") {
    return null;
  }
  const allCollections = state.dashboard?.allCollections || state.dashboard?.collections || [];
  return allCollections.find((entry) => entry.id === state.selectedCollectionId);
}

// Render progress metadata for the selected collection or the "all" view.
export function renderSelectedCollectionStats() {
  if (state.selectedCollectionId === "all") {
    const totalWords = Number(state.dashboard?.totalWords || 0);
    const knownWords = Number(state.dashboard?.knownWords || 0);
    const learningWords = Number(state.dashboard?.learningWords || 0);
    const unknownWords = Number(state.dashboard?.unknownWords || 0);
    const percent = totalWords ? Math.round((knownWords / totalWords) * 100) : 0;
    elements.selectedCollectionStats.innerHTML = `
      <span>${escapeHtml(t("collections.all"))}</span>
      <small>${escapeHtml(state.selectedStudyLanguageName || "")}</small>
      <strong>${formatCount(knownWords)} / ${formatCount(totalWords)}</strong>
      <small>${escapeHtml(t("progress.statusBreakdown", { known: formatCount(knownWords), learning: formatCount(learningWords), unknown: formatCount(unknownWords) }))}</small>
      <small>${escapeHtml(t("progress.knownPercent", { percent }))}</small>
    `;
    return;
  }

  const collection = getSelectedCollection();
  if (!collection) {
    elements.selectedCollectionStats.innerHTML = "";
    return;
  }

  const percent = collection.totalWords ? Math.round((collection.knownWords / collection.totalWords) * 100) : 0;
  elements.selectedCollectionStats.innerHTML = `
    <span>${escapeHtml(collection.name)}</span>
    <small>${escapeHtml(collection.languageName)}</small>
    <strong>${formatCount(collection.knownWords)} / ${formatCount(collection.totalWords)}</strong>
    <small>${escapeHtml(t("progress.statusBreakdown", { known: formatCount(collection.knownWords), learning: formatCount(collection.learningWords), unknown: formatCount(collection.unknownWords) }))}</small>
    <small>${escapeHtml(t("progress.knownPercent", { percent }))}</small>
  `;
}

// Render one collection progress chart card.
function renderChartCard(collection) {
  const knownPercent = collection.totalWords ? Math.round((collection.knownWords / collection.totalWords) * 100) : 0;
  const learningPercent = collection.totalWords ? Math.round(((collection.knownWords + collection.learningWords) / collection.totalWords) * 100) : 0;
  return `
    <article class="chart-card rounded-lg border border-line bg-panel p-3.5">
      <div class="pie" style="--knownPercent: ${knownPercent}%; --learningPercent: ${learningPercent}%"></div>
      <div>
        <strong>${escapeHtml(collection.name)}</strong>
        <span>${escapeHtml(collection.languageName)}</span>
        <span>${escapeHtml(t("progress.knownOfTotal", { total: formatCount(collection.totalWords), known: formatCount(collection.knownWords) }))}</span>
        <span>${escapeHtml(t("progress.statusBreakdown", { known: formatCount(collection.knownWords), learning: formatCount(collection.learningWords), unknown: formatCount(collection.unknownWords) }))}</span>
        <span>${escapeHtml(t("progress.complete", { percent: knownPercent }))}</span>
      </div>
    </article>
  `;
}
