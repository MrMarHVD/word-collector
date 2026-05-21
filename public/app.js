const state = {
  dashboard: null,
  selectedDashboardLanguageId: null,
  selectedCollectionId: null,
  search: "",
  activeTab: "dashboard"
};

const elements = {
  tabButtons: document.querySelectorAll(".tab-button"),
  dashboardView: document.querySelector("#dashboardView"),
  collectionsView: document.querySelector("#collectionsView"),
  dashboardLanguageSelect: document.querySelector("#dashboardLanguageSelect"),
  knownTotal: document.querySelector("#knownTotal"),
  totalWords: document.querySelector("#totalWords"),
  unknownTotal: document.querySelector("#unknownTotal"),
  collectionCount: document.querySelector("#collectionCount"),
  collectionCharts: document.querySelector("#collectionCharts"),
  collectionSelect: document.querySelector("#collectionSelect"),
  deleteCollectionButton: document.querySelector("#deleteCollectionButton"),
  searchInput: document.querySelector("#searchInput"),
  selectedCollectionStats: document.querySelector("#selectedCollectionStats"),
  collectionLanguageName: document.querySelector("#collectionLanguageName"),
  saveCollectionLanguageButton: document.querySelector("#saveCollectionLanguageButton"),
  wordRows: document.querySelector("#wordRows"),
  emptyState: document.querySelector("#emptyState"),
  uploadForm: document.querySelector("#uploadForm"),
  uploadLanguageName: document.querySelector("#uploadLanguageName"),
  collectionName: document.querySelector("#collectionName"),
  csvFile: document.querySelector("#csvFile"),
  uploadStatus: document.querySelector("#uploadStatus"),
  languageOptions: document.querySelector("#languageOptions")
};

function formatCount(value) {
  return new Intl.NumberFormat().format(value);
}

function setActiveTab(tabName) {
  state.activeTab = tabName;
  elements.dashboardView.hidden = tabName !== "dashboard";
  elements.collectionsView.hidden = tabName !== "collections";
  elements.tabButtons.forEach((button) => {
    const active = button.dataset.tab === tabName;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
}

function parseCsv(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = [",", ";", "\t"].find((candidate) => line.includes(candidate));
      if (separator) {
        const [word, ...translation] = line.split(separator);
        return { word: word?.trim(), translation: translation.join(separator).trim() };
      }

      const match = line.match(/^(\S+)\s+(.+)$/);
      return match ? { word: match[1].trim(), translation: match[2].trim() } : null;
    })
    .filter((entry) => entry?.word && entry?.translation);
}

async function requestJson(url, options) {
  const response = await fetch(url, {
    headers: { "content-type": "application/json" },
    ...options
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }
  return payload;
}

async function loadDashboard() {
  const params = new URLSearchParams();
  if (state.selectedDashboardLanguageId) {
    params.set("languageId", state.selectedDashboardLanguageId);
  }
  state.dashboard = await requestJson(`/api/dashboard?${params}`);

  const allCollections = state.dashboard.allCollections || state.dashboard.collections;
  if (!state.selectedCollectionId && allCollections.length) {
    state.selectedCollectionId = allCollections[0].id;
  }
  if (state.selectedCollectionId && !allCollections.some((collection) => collection.id === state.selectedCollectionId)) {
    state.selectedCollectionId = allCollections[0]?.id || null;
  }
  renderDashboard();
  await loadWords();
}

function renderDashboard() {
  const { totalWords, knownWords, collections, languages } = state.dashboard;
  const allCollections = state.dashboard.allCollections || collections;
  elements.knownTotal.textContent = formatCount(knownWords);
  elements.totalWords.textContent = formatCount(totalWords);
  elements.unknownTotal.textContent = formatCount(totalWords - knownWords);
  elements.collectionCount.textContent = formatCount(collections.length);

  elements.dashboardLanguageSelect.innerHTML = `
    <option value="">すべての言語</option>
    ${languages
      .map((language) => {
        const selected = language.id === state.selectedDashboardLanguageId ? "selected" : "";
        return `<option value="${language.id}" ${selected}>${escapeHtml(language.name)}</option>`;
      })
      .join("")}
  `;

  elements.languageOptions.innerHTML = languages
    .map((language) => `<option value="${escapeHtml(language.name)}"></option>`)
    .join("");

  elements.collectionCharts.innerHTML = collections.length
    ? collections.map(renderChartCard).join("")
    : `<p class="empty">まだコレクションがありません。</p>`;

  elements.collectionSelect.innerHTML = allCollections.length
    ? allCollections
        .map((collection) => {
          const selected = collection.id === state.selectedCollectionId ? "selected" : "";
          return `<option value="${collection.id}" ${selected}>${escapeHtml(collection.languageName)} / ${escapeHtml(collection.name)}</option>`;
        })
        .join("")
    : `<option value="">コレクションなし</option>`;

  elements.deleteCollectionButton.disabled = !state.selectedCollectionId;
  elements.saveCollectionLanguageButton.disabled = !state.selectedCollectionId;
  renderSelectedCollectionStats();
}

function renderChartCard(collection) {
  const percent = collection.totalWords ? Math.round((collection.knownWords / collection.totalWords) * 100) : 0;
  return `
    <article class="chart-card">
      <div class="pie" style="--knownPercent: ${percent}%"></div>
      <div>
        <strong>${escapeHtml(collection.name)}</strong>
        <span>${escapeHtml(collection.languageName)}</span>
        <span>${formatCount(collection.totalWords)}語中 ${formatCount(collection.knownWords)}語が既知</span>
        <span>${percent}% 完了</span>
      </div>
    </article>
  `;
}

function renderSelectedCollectionStats() {
  const allCollections = state.dashboard?.allCollections || state.dashboard?.collections || [];
  const collection = allCollections.find((entry) => entry.id === state.selectedCollectionId);
  if (!collection) {
    elements.selectedCollectionStats.innerHTML = "";
    elements.collectionLanguageName.value = "";
    return;
  }

  const percent = collection.totalWords ? Math.round((collection.knownWords / collection.totalWords) * 100) : 0;
  elements.collectionLanguageName.value = collection.languageName;
  elements.selectedCollectionStats.innerHTML = `
    <span>${escapeHtml(collection.name)}</span>
    <small>${escapeHtml(collection.languageName)}</small>
    <strong>${formatCount(collection.knownWords)} / ${formatCount(collection.totalWords)}</strong>
    <small>${percent}% 既知</small>
  `;
}

async function loadWords() {
  if (!state.selectedCollectionId) {
    elements.wordRows.innerHTML = "";
    elements.emptyState.hidden = false;
    elements.emptyState.textContent = "CSVをアップロードして最初のコレクションを作成してください。";
    return;
  }

  const params = new URLSearchParams();
  if (state.search) {
    params.set("search", state.search);
  }

  const result = await requestJson(`/api/collections/${state.selectedCollectionId}/words?${params}`);
  renderWords(result.words);
}

function renderWords(words) {
  elements.wordRows.innerHTML = words
    .map(
      (entry) => `
      <tr>
        <td>${escapeHtml(entry.word)}</td>
        <td>${escapeHtml(entry.translation)}</td>
        <td class="known-cell">
          <button class="known-toggle" data-word-id="${entry.id}" data-known="${Boolean(entry.known)}">
            ${entry.known ? "既知" : "未習得"}
          </button>
        </td>
      </tr>
    `
    )
    .join("");

  const hasCollections = (state.dashboard.allCollections || state.dashboard.collections).length > 0;
  elements.emptyState.hidden = words.length > 0 || hasCollections;
  if (!words.length && hasCollections) {
    elements.emptyState.hidden = false;
    elements.emptyState.textContent = "検索に一致する単語はありません。";
  } else {
    elements.emptyState.textContent = "CSVをアップロードして最初のコレクションを作成してください。";
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[character];
  });
}

elements.uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = elements.uploadForm.querySelector("button");
  submitButton.disabled = true;
  elements.uploadStatus.textContent = "Uploading...";

  try {
    const file = elements.csvFile.files[0];
    const rows = parseCsv(await file.text());
    const result = await requestJson("/api/import", {
      method: "POST",
      body: JSON.stringify({
        collectionName: elements.collectionName.value,
        languageName: elements.uploadLanguageName.value,
        words: rows
      })
    });

    state.selectedCollectionId = result.collection.id;
    state.search = "";
    setActiveTab("collections");
    elements.searchInput.value = "";
    elements.uploadStatus.textContent = `${result.inserted}件を追加、${result.skipped}件をスキップしました。`;
    elements.uploadForm.reset();
    await loadDashboard();
  } catch (error) {
    elements.uploadStatus.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
});

elements.tabButtons.forEach((button) => {
  button.addEventListener("click", () => setActiveTab(button.dataset.tab));
});

elements.dashboardLanguageSelect.addEventListener("change", async (event) => {
  state.selectedDashboardLanguageId = Number(event.target.value) || null;
  await loadDashboard();
});

elements.collectionSelect.addEventListener("change", async (event) => {
  state.selectedCollectionId = Number(event.target.value) || null;
  state.search = "";
  elements.searchInput.value = "";
  renderSelectedCollectionStats();
  await loadWords();
});

elements.saveCollectionLanguageButton.addEventListener("click", async () => {
  if (!state.selectedCollectionId) {
    return;
  }

  elements.saveCollectionLanguageButton.disabled = true;
  try {
    await requestJson(`/api/collections/${state.selectedCollectionId}`, {
      method: "PATCH",
      body: JSON.stringify({ languageName: elements.collectionLanguageName.value })
    });
    await loadDashboard();
  } finally {
    elements.saveCollectionLanguageButton.disabled = false;
  }
});

elements.deleteCollectionButton.addEventListener("click", async () => {
  if (!state.selectedCollectionId) {
    return;
  }

  const collection = (state.dashboard.allCollections || state.dashboard.collections).find((entry) => entry.id === state.selectedCollectionId);
  const confirmed = window.confirm(`「${collection?.name || "このコレクション"}」と含まれる単語をすべて削除しますか？`);
  if (!confirmed) {
    return;
  }

  elements.deleteCollectionButton.disabled = true;
  await requestJson(`/api/collections/${state.selectedCollectionId}`, { method: "DELETE" });
  state.selectedCollectionId = null;
  state.search = "";
  elements.searchInput.value = "";
  await loadDashboard();
});

elements.searchInput.addEventListener("input", async (event) => {
  state.search = event.target.value.trim();
  await loadWords();
});

elements.wordRows.addEventListener("click", async (event) => {
  const button = event.target.closest(".known-toggle");
  if (!button) {
    return;
  }

  const id = Number(button.dataset.wordId);
  const known = button.dataset.known !== "true";
  button.disabled = true;

  try {
    await requestJson(`/api/words/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ known })
    });
    await loadDashboard();
  } finally {
    button.disabled = false;
  }
});

setActiveTab("dashboard");
await loadDashboard();
