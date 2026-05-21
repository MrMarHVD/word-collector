const WORD_PAGE_SIZE = 50;

const state = {
  user: null,
  predefinedLanguages: [],
  authMode: "login",
  dashboard: null,
  selectedDashboardLanguageId: null,
  selectedCollectionId: null,
  words: [],
  visibleWordCount: WORD_PAGE_SIZE,
  wordDisplayMode: localStorage.getItem("wordMarkerDisplayMode") || "infinite",
  search: "",
  activeTab: localStorage.getItem("wordMarkerActiveTab") || "dashboard",
  locale: localStorage.getItem("wordMarkerLocale") || "ja",
  messages: {}
};

const elements = {
  html: document.documentElement,
  title: document.querySelector("title"),
  authView: document.querySelector("#authView"),
  onboardingView: document.querySelector("#onboardingView"),
  appShell: document.querySelector("#appShell"),
  authForm: document.querySelector("#authForm"),
  authModeButtons: document.querySelectorAll(".auth-mode-button"),
  authEmail: document.querySelector("#authEmail"),
  authPassword: document.querySelector("#authPassword"),
  authConfirmWrap: document.querySelector("#authConfirmWrap"),
  authConfirmPassword: document.querySelector("#authConfirmPassword"),
  authSubmit: document.querySelector("#authSubmit"),
  authStatus: document.querySelector("#authStatus"),
  onboardingLanguages: document.querySelector("#onboardingLanguages"),
  onboardingStatus: document.querySelector("#onboardingStatus"),
  localeButtons: document.querySelectorAll(".locale-button"),
  tabButtons: document.querySelectorAll(".tab-button"),
  dashboardView: document.querySelector("#dashboardView"),
  collectionsView: document.querySelector("#collectionsView"),
  dashboardLanguageSelect: document.querySelector("#dashboardLanguageSelect"),
  predefinedLanguageSelect: document.querySelector("#predefinedLanguageSelect"),
  addLanguageButton: document.querySelector("#addLanguageButton"),
  logoutButton: document.querySelector("#logoutButton"),
  knownTotal: document.querySelector("#knownTotal"),
  totalWords: document.querySelector("#totalWords"),
  unknownTotal: document.querySelector("#unknownTotal"),
  collectionCount: document.querySelector("#collectionCount"),
  collectionCharts: document.querySelector("#collectionCharts"),
  collectionSelect: document.querySelector("#collectionSelect"),
  deleteCollectionButton: document.querySelector("#deleteCollectionButton"),
  searchInput: document.querySelector("#searchInput"),
  displayModeButtons: document.querySelectorAll(".display-mode-button"),
  selectedCollectionStats: document.querySelector("#selectedCollectionStats"),
  collectionLanguageSelect: document.querySelector("#collectionLanguageSelect"),
  saveCollectionLanguageButton: document.querySelector("#saveCollectionLanguageButton"),
  tableWrap: document.querySelector(".table-wrap"),
  wordRows: document.querySelector("#wordRows"),
  wordListStatus: document.querySelector("#wordListStatus"),
  emptyState: document.querySelector("#emptyState"),
  uploadForm: document.querySelector("#uploadForm"),
  uploadLanguageSelect: document.querySelector("#uploadLanguageSelect"),
  collectionName: document.querySelector("#collectionName"),
  csvFile: document.querySelector("#csvFile"),
  uploadStatus: document.querySelector("#uploadStatus"),
  languageOptions: document.querySelector("#languageOptions")
};

async function loadMessages() {
  state.messages = await requestJson("/locales.json");
  if (!state.messages[state.locale]) {
    state.locale = "ja";
  }
  if (!["all", "infinite"].includes(state.wordDisplayMode)) {
    state.wordDisplayMode = "infinite";
  }
  if (!["dashboard", "collections"].includes(state.activeTab)) {
    state.activeTab = "dashboard";
  }
}

function t(key, values = {}) {
  const message = state.messages[state.locale]?.[key] || state.messages.ja?.[key] || key;
  return Object.entries(values).reduce((text, [name, value]) => {
    return text.replaceAll(`{${name}}`, value);
  }, message);
}

function applyLocale() {
  elements.html.lang = state.locale;
  elements.title.textContent = `${t("brand")} - ${t("app.title")}`;
  elements.localeButtons.forEach((button) => {
    const active = button.dataset.locale === state.locale;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  renderDisplayModeButtons();

  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  });

  renderAuthMode();
  renderOnboarding(state.predefinedLanguages);
  if (state.dashboard) {
    renderDashboard();
    renderWords(state.words);
  }
}

function renderDisplayModeButtons() {
  elements.displayModeButtons.forEach((button) => {
    const active = button.dataset.displayMode === state.wordDisplayMode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function resetWordWindow() {
  state.visibleWordCount = WORD_PAGE_SIZE;
  elements.tableWrap.scrollTop = 0;
}

function formatCount(value) {
  return new Intl.NumberFormat(state.locale).format(value);
}

function setActiveTab(tabName) {
  state.activeTab = tabName;
  localStorage.setItem("wordMarkerActiveTab", tabName);
  elements.dashboardView.hidden = tabName !== "dashboard";
  elements.collectionsView.hidden = tabName !== "collections";
  elements.tabButtons.forEach((button) => {
    const active = button.dataset.tab === tabName;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
}

function showView(viewName) {
  elements.authView.hidden = viewName !== "auth";
  elements.onboardingView.hidden = viewName !== "onboarding";
  elements.appShell.hidden = viewName !== "app";
}

function renderAuthMode() {
  elements.authModeButtons.forEach((button) => {
    const active = button.dataset.authMode === state.authMode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  const isRegister = state.authMode === "register";
  elements.authConfirmWrap.hidden = !isRegister;
  elements.authConfirmPassword.required = isRegister;
  elements.authSubmit.textContent = t(isRegister ? "auth.register" : "auth.login");
}

function renderOnboarding(predefinedLanguages) {
  elements.onboardingLanguages.innerHTML = predefinedLanguages.length
    ? predefinedLanguages
        .map((language) => `<button class="language-pick" type="button" data-predefined-language-id="${language.id}">${escapeHtml(language.name)}</button>`)
        .join("")
    : `<p class="empty">${escapeHtml(t("onboarding.noLanguages"))}</p>`;
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
  if (response.status === 401) {
    state.user = null;
    showView("auth");
  }
  if (!response.ok) {
    throw new Error(payload.error || t("errors.requestFailed"));
  }
  return payload;
}

async function loadSession() {
  const result = await requestJson("/api/auth/me");
  state.user = result.user;
  state.predefinedLanguages = result.predefinedLanguages || [];
  if (!state.user) {
    showView("auth");
    renderAuthMode();
    return;
  }
  if (result.needsOnboarding) {
    showView("onboarding");
    renderOnboarding(state.predefinedLanguages);
    return;
  }
  const languages = result.languages || [];
  const savedLanguageId = Number(localStorage.getItem("wordMarkerLearningLanguageId")) || null;
  state.selectedDashboardLanguageId = languages.some((language) => language.id === savedLanguageId) ? savedLanguageId : languages[0]?.id || null;
  showView("app");
  setActiveTab(state.activeTab);
  await loadDashboard();
}

async function loadDashboard() {
  const params = new URLSearchParams();
  if (state.selectedDashboardLanguageId) {
    params.set("languageId", state.selectedDashboardLanguageId);
  }
  state.dashboard = await requestJson(`/api/dashboard?${params}`);

  state.predefinedLanguages = state.dashboard.predefinedLanguages || state.predefinedLanguages;
  const allCollections = state.dashboard.collections;
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
  const allCollections = collections;
  elements.knownTotal.textContent = formatCount(knownWords);
  elements.totalWords.textContent = formatCount(totalWords);
  elements.unknownTotal.textContent = formatCount(totalWords - knownWords);
  elements.collectionCount.textContent = formatCount(collections.length);

  elements.dashboardLanguageSelect.innerHTML = `
    ${languages
      .map((language) => {
        const selected = language.id === state.selectedDashboardLanguageId ? "selected" : "";
        return `<option value="${language.id}" ${selected}>${escapeHtml(language.name)}</option>`;
      })
      .join("")}
  `;
  elements.predefinedLanguageSelect.innerHTML = state.predefinedLanguages
    .filter((predefined) => !languages.some((language) => language.name.toLowerCase() === predefined.name.toLowerCase()))
    .map((language) => `<option value="${language.id}">${escapeHtml(language.name)}</option>`)
    .join("");
  elements.addLanguageButton.disabled = !elements.predefinedLanguageSelect.value;

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
  elements.uploadLanguageSelect.innerHTML = languages
    .map((language) => {
      const selected = language.id === state.selectedDashboardLanguageId ? "selected" : "";
      return `<option value="${language.id}" ${selected}>${escapeHtml(language.name)}</option>`;
    })
    .join("");
  renderSelectedCollectionStats();
}

function getSelectedCollection() {
  const allCollections = state.dashboard?.allCollections || state.dashboard?.collections || [];
  return allCollections.find((entry) => entry.id === state.selectedCollectionId);
}

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

function renderSelectedCollectionStats() {
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

async function loadWords() {
  if (!state.selectedCollectionId) {
    state.words = [];
    elements.wordRows.innerHTML = "";
    elements.wordListStatus.hidden = true;
    elements.emptyState.hidden = false;
    elements.emptyState.textContent = t("collections.empty");
    return;
  }

  const params = new URLSearchParams();
  if (state.search) {
    params.set("search", state.search);
  }

  const result = await requestJson(`/api/collections/${state.selectedCollectionId}/words?${params}`);
  state.words = result.words;
  renderWords(result.words);
}

function renderWords(words) {
  renderDisplayModeButtons();
  const visibleWords = state.wordDisplayMode === "infinite" ? words.slice(0, state.visibleWordCount) : words;
  elements.tableWrap.classList.toggle("is-scrollable", state.wordDisplayMode === "infinite" && words.length > WORD_PAGE_SIZE);

  elements.wordRows.innerHTML = visibleWords
    .map(
      (entry) => `
      <tr>
        <td>${escapeHtml(entry.word)}</td>
        <td>${escapeHtml(entry.translation)}</td>
        <td class="known-cell">
          <button class="known-toggle" data-word-id="${entry.id}" data-known="${Boolean(entry.known)}">
            ${entry.known ? escapeHtml(t("word.known")) : escapeHtml(t("word.unknown"))}
          </button>
        </td>
      </tr>
    `
    )
    .join("");

  const hasCollections = (state.dashboard.allCollections || state.dashboard.collections).length > 0;
  elements.emptyState.hidden = words.length > 0 || hasCollections;
  elements.wordListStatus.hidden = !words.length;
  elements.wordListStatus.textContent =
    state.wordDisplayMode === "infinite"
      ? t("collections.showingWords", {
          shown: formatCount(visibleWords.length),
          total: formatCount(words.length)
        })
      : t("collections.totalWords", { total: formatCount(words.length) });

  if (!words.length && hasCollections) {
    elements.emptyState.hidden = false;
    elements.emptyState.textContent = t("collections.noSearchResults");
  } else {
    elements.emptyState.textContent = t("collections.empty");
  }
}

function loadMoreWordsIfNeeded() {
  if (state.wordDisplayMode !== "infinite" || state.visibleWordCount >= state.words.length) {
    return;
  }

  const remainingScroll = elements.tableWrap.scrollHeight - elements.tableWrap.scrollTop - elements.tableWrap.clientHeight;
  if (remainingScroll > 120) {
    return;
  }

  state.visibleWordCount = Math.min(state.visibleWordCount + WORD_PAGE_SIZE, state.words.length);
  renderWords(state.words);
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
  elements.uploadStatus.textContent = t("upload.inProgress");

  try {
    const file = elements.csvFile.files[0];
    const rows = parseCsv(await file.text());
    const result = await requestJson("/api/import", {
      method: "POST",
      body: JSON.stringify({
        collectionName: elements.collectionName.value,
        languageId: Number(elements.uploadLanguageSelect.value || state.selectedDashboardLanguageId),
        words: rows
      })
    });

    state.selectedCollectionId = result.collection.id;
    state.search = "";
    setActiveTab("collections");
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

elements.tabButtons.forEach((button) => {
  button.addEventListener("click", () => setActiveTab(button.dataset.tab));
});

elements.authModeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.authMode = button.dataset.authMode;
    elements.authStatus.textContent = "";
    renderAuthMode();
  });
});

elements.authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const isRegister = state.authMode === "register";
  elements.authSubmit.disabled = true;
  elements.authStatus.textContent = t(isRegister ? "auth.registering" : "auth.loggingIn");
  try {
    await requestJson(isRegister ? "/api/auth/register" : "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: elements.authEmail.value,
        password: elements.authPassword.value,
        confirmPassword: elements.authConfirmPassword.value
      })
    });
    elements.authForm.reset();
    await loadSession();
  } catch (error) {
    elements.authStatus.textContent = error.message;
  } finally {
    elements.authSubmit.disabled = false;
  }
});

elements.onboardingLanguages.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-predefined-language-id]");
  if (!button) {
    return;
  }
  button.disabled = true;
  try {
    const result = await requestJson("/api/user/languages", {
      method: "POST",
      body: JSON.stringify({ predefinedLanguageId: Number(button.dataset.predefinedLanguageId) })
    });
    state.selectedDashboardLanguageId = result.language.id;
    localStorage.setItem("wordMarkerLearningLanguageId", String(result.language.id));
    showView("app");
    await loadDashboard();
  } catch (error) {
    elements.onboardingStatus.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

elements.addLanguageButton.addEventListener("click", async () => {
  const predefinedLanguageId = Number(elements.predefinedLanguageSelect.value);
  if (!predefinedLanguageId) {
    return;
  }
  elements.addLanguageButton.disabled = true;
  try {
    const result = await requestJson("/api/user/languages", {
      method: "POST",
      body: JSON.stringify({ predefinedLanguageId })
    });
    state.selectedDashboardLanguageId = result.language.id;
    localStorage.setItem("wordMarkerLearningLanguageId", String(result.language.id));
    await loadDashboard();
  } finally {
    elements.addLanguageButton.disabled = false;
  }
});

elements.logoutButton.addEventListener("click", async () => {
  elements.logoutButton.disabled = true;
  try {
    await requestJson("/api/auth/logout", { method: "POST" });
  } finally {
    state.user = null;
    state.dashboard = null;
    state.words = [];
    showView("auth");
    elements.logoutButton.disabled = false;
  }
});

elements.displayModeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.wordDisplayMode = button.dataset.displayMode;
    localStorage.setItem("wordMarkerDisplayMode", state.wordDisplayMode);
    resetWordWindow();
    renderDisplayModeButtons();
    renderWords(state.words);
  });
});

elements.localeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.locale = button.dataset.locale;
    localStorage.setItem("wordMarkerLocale", state.locale);
    applyLocale();
  });
});

elements.dashboardLanguageSelect.addEventListener("change", async (event) => {
  state.selectedDashboardLanguageId = Number(event.target.value) || null;
  localStorage.setItem("wordMarkerLearningLanguageId", String(state.selectedDashboardLanguageId || ""));
  state.selectedCollectionId = null;
  resetWordWindow();
  await loadDashboard();
});

elements.collectionSelect.addEventListener("change", async (event) => {
  state.selectedCollectionId = Number(event.target.value) || null;
  state.search = "";
  elements.searchInput.value = "";
  resetWordWindow();
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
      body: JSON.stringify({ languageId: Number(elements.collectionLanguageSelect.value) })
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
  const confirmed = window.confirm(t("collections.deleteConfirm", { name: collection?.name || t("collections.collection") }));
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
  resetWordWindow();
  await loadWords();
});

elements.tableWrap.addEventListener("scroll", loadMoreWordsIfNeeded);

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

await loadMessages();
applyLocale();
renderAuthMode();
await loadSession();
