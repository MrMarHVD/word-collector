import { requestJson, setUnauthorizedHandler } from "./api.js";
import { parseCsv } from "./csv.js";
import { elements } from "./dom.js";
import { formatCount, loadMessages, t } from "./i18n.js";
import { escapeHtml } from "./shared/html.js";
import { state } from "./state.js";
import { renderAuthMode } from "./views/auth.js";
import { renderDashboard, renderSelectedCollectionStats } from "./views/dashboard.js";
import { renderOnboarding } from "./views/onboarding.js";
import { renderMaterialList, renderReaderSidebar, renderReaderSidebarTabs, renderReaderTokens, renderReaderWordInfo } from "./views/reader.js";
import { renderDisplayModeButtons, renderLocaleButtons, resetWordWindow, setActiveTab, showView } from "./views/shell.js";
import { loadMoreWordsIfNeeded, renderWords } from "./views/words.js";

const MIN_READER_PANEL_WIDTH = 360;
const MIN_READER_PANEL_HEIGHT = 520;
const MAX_READER_SIDEBAR_WIDTH = 340;
const MAX_READER_SIDEBAR_WIDTH_SMALL = 240;
const READER_PANEL_BOTTOM_MARGIN = 16;

// Re-render every visible string and locale-sensitive control after a language change.
// Apply the active locale to static text, controls, and visible views.
function applyLocale() {
  elements.html.lang = state.locale;
  elements.title.textContent = `${t("brand")} - ${t("app.title")}`;
  renderLocaleButtons();
  renderDisplayModeButtons();

  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  });

  renderAuthMode();
  renderOnboarding(state.predefinedLanguages);
  renderSettings();
  renderStudyLanguageSelect();
  if (state.dashboard) {
    renderDashboard();
    renderReaderSidebar();
    renderReaderSidebarTabs();
    renderMaterialList();
    renderReaderTokens();
    renderWords(state.words);
  }
}

// Render native-language settings options for the current user profile.
function renderSettings() {
  if (!elements.nativeLanguageSelect) {
    return;
  }
  elements.nativeLanguageSelect.innerHTML = state.nativeLanguageOptions
    .map((language) => {
      const selected = language === state.user?.nativeLanguage ? "selected" : "";
      return `<option value="${escapeHtml(language)}" ${selected}>${escapeHtml(t(`settings.nativeLanguage.${language}`))}</option>`;
    })
    .join("");
}

// Return the localized display label for a study language.
function studyLanguageLabel(language) {
  return t(`studyLanguage.${language}`);
}

function renderReaderSidebarAfterLayout() {
  requestAnimationFrame(() => requestAnimationFrame(renderReaderSidebar));
}

function activateTab(tabName) {
  setActiveTab(tabName);
  if (tabName === "reader") {
    renderReaderSidebarAfterLayout();
  }
}

// Return configured study languages that exist for the signed-in user.
function availableStudyLanguages() {
  return state.studyLanguageOptions
    .map((name) => state.languages.find((language) => language.name.toLowerCase() === name.toLowerCase()))
    .filter(Boolean);
}

// Render the study-language selector from available user languages.
function renderStudyLanguageSelect() {
  if (!elements.studyLanguageSelect) {
    return;
  }
  elements.studyLanguageSelect.innerHTML = availableStudyLanguages()
    .map((language) => {
      const selected = language.id === state.selectedStudyLanguageId ? "selected" : "";
      return `<option value="${escapeHtml(language.name)}" ${selected}>${escapeHtml(studyLanguageLabel(language.name))}</option>`;
    })
    .join("");
}

// Find a language by case-insensitive name.
function languageByName(languages, name) {
  return languages.find((language) => language.name.toLowerCase() === name.toLowerCase());
}

// Select the active study language and optionally reload dependent data.
async function setStudyLanguage(languageName, { persist = true, reload = true } = {}) {
  if (!state.studyLanguageOptions.includes(languageName)) {
    return;
  }
  const language = languageByName(state.languages, languageName);
  if (!language) {
    return;
  }
  state.selectedStudyLanguageName = language.name;
  state.selectedStudyLanguageId = language.id;
  if (persist) {
    localStorage.setItem("wordMarkerStudyLanguageName", language.name);
  }
  renderStudyLanguageSelect();
  if (reload) {
    // Language changes invalidate reader, collection, and pagination state.
    state.selectedCollectionId = null;
    state.selectedMaterialId = null;
    state.currentMaterial = null;
    state.readerTokens = [];
    state.readerStart = 0;
    resetWordWindow();
    await loadDashboard();
  }
}

// Load the current session and route the browser to the correct top-level view.
async function loadSession() {
  // Session loading is the gate between auth, onboarding, and the app shell.
  const result = await requestJson("/api/auth/me");
  state.user = result.user;
  state.languages = result.languages || [];
  state.predefinedLanguages = result.predefinedLanguages || [];
  state.studyLanguageOptions = result.studyLanguageOptions || [];
  state.nativeLanguageOptions = result.nativeLanguageOptions || [];
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
  const savedLanguageName = localStorage.getItem("wordMarkerStudyLanguageName") || "";
  const availableLanguages = availableStudyLanguages();
  const fallbackLanguageName = availableLanguages[0]?.name || "";
  state.selectedStudyLanguageName = availableLanguages.some((language) => language.name === savedLanguageName) ? savedLanguageName : fallbackLanguageName;
  showView("app");
  activateTab(state.activeTab);
  renderSettings();
  await setStudyLanguage(state.selectedStudyLanguageName, { persist: true, reload: false });
  await loadDashboard();
}

// Load dashboard data and refresh dependent collection, material, and word views.
async function loadDashboard() {
  const params = new URLSearchParams();
  if (state.selectedStudyLanguageId) {
    params.set("languageId", state.selectedStudyLanguageId);
  }
  state.dashboard = await requestJson(`/api/dashboard?${params}`);

  state.predefinedLanguages = state.dashboard.predefinedLanguages || state.predefinedLanguages;
  state.studyLanguageOptions = state.dashboard.studyLanguageOptions || state.studyLanguageOptions;
  state.languages = state.dashboard.languages || state.languages;
  const selectedLanguage = languageByName(state.languages, state.selectedStudyLanguageName) || state.languages.find((language) => language.id === state.selectedStudyLanguageId);
  if (selectedLanguage) {
    state.selectedStudyLanguageName = selectedLanguage.name;
    state.selectedStudyLanguageId = selectedLanguage.id;
  }
  const allCollections = state.dashboard.collections;
  if (!state.selectedCollectionId && allCollections.length) {
    state.selectedCollectionId = allCollections[0].id;
  }
  if (state.selectedCollectionId && !allCollections.some((collection) => collection.id === state.selectedCollectionId)) {
    state.selectedCollectionId = allCollections[0]?.id || null;
  }
  renderDashboard();
  renderStudyLanguageSelect();
  renderReaderSidebar();
  renderReaderSidebarTabs();
  await loadMaterials(true);
  await loadWords();
}

// Load one page of materials, optionally resetting the material list.
async function loadMaterials(reset = false) {
  if (!state.selectedStudyLanguageId) {
    state.materials = [];
    state.selectedMaterialId = null;
    renderMaterialList();
    renderReaderTokens();
    return;
  }
  if (reset) {
    state.materialOffset = 0;
    state.materialHasMore = true;
    state.materials = [];
  }
  if (!state.materialHasMore) {
    return;
  }
  const result = await requestJson(`/api/materials?languageId=${state.selectedStudyLanguageId}&offset=${state.materialOffset}`);
  state.materials = state.materials.concat(result.materials);
  state.materialOffset += result.materials.length;
  state.materialHasMore = result.materials.length === result.pageSize;
  if (state.selectedMaterialId && !state.materials.some((material) => material.id === state.selectedMaterialId)) {
    state.selectedMaterialId = null;
  }
  renderMaterialList();
  renderReaderTokens();
}

// Load a bounded reader token page for the selected material.
async function loadMaterialReader(start = 0) {
  if (!state.selectedMaterialId) {
    state.currentMaterial = null;
    state.readerTokens = [];
    renderReaderTokens();
    return;
  }
  state.readerStart = Math.max(start, 0);
  const result = await requestJson(`/api/materials/${state.selectedMaterialId}?start=${state.readerStart}&limit=${state.readerWordsPerPage}`);
  state.currentMaterial = result.material;
  state.currentMaterial.translationStatus = result.translationStatus;
  state.readerTokens = result.tokens;
  renderReaderTokens();
}

// Clamp a numeric value between inclusive minimum and maximum values.
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Start pointer-based resizing for the reader sidebar, info pane, or panel.
function startReaderResize(event, target) {
  event.preventDefault();
  const startX = event.clientX;
  const startY = event.clientY;
  const layoutRect = elements.readerLayout.getBoundingClientRect();
  const sidebarWidth = state.readerSidebarCollapsed ? 0 : elements.readerSidebar.getBoundingClientRect().width;
  const panelRect = elements.readerPanel.getBoundingClientRect();
  const initialWidth = target === "sidebar" ? state.readerSidebarWidth : target === "info" ? state.readerInfoWidth : panelRect.width;
  const initialHeight = panelRect.height;
  const availablePanelWidth = Math.max(1, Math.floor(layoutRect.width - sidebarWidth));
  const minPanelWidth = Math.min(MIN_READER_PANEL_WIDTH, availablePanelWidth);
  const minSidebarWidth = window.matchMedia("(max-width: 760px)").matches ? 160 : 240;
  const minWidth = target === "sidebar" ? minSidebarWidth : target === "info" ? 220 : minPanelWidth;
  const maxPanelWidth = Math.max(minPanelWidth, availablePanelWidth);
  const maxSidebarWidth = window.matchMedia("(max-width: 760px)").matches ? MAX_READER_SIDEBAR_WIDTH_SMALL : MAX_READER_SIDEBAR_WIDTH;
  const maxWidth = target === "panel" ? maxPanelWidth : target === "sidebar" ? Math.max(minWidth, maxSidebarWidth) : Math.max(minWidth, Math.floor(window.innerWidth * 0.55));
  const maxPanelHeight = Math.max(1, window.innerHeight - panelRect.top - READER_PANEL_BOTTOM_MARGIN);
  const minHeight = target === "panel" ? Math.min(MIN_READER_PANEL_HEIGHT, maxPanelHeight) : 320;
  const maxHeight = target === "panel" ? maxPanelHeight : Math.max(minHeight, window.innerHeight - 90);

  // Apply pointer movement to the active reader dimension.
  function resize(moveEvent) {
    // Reader dimensions are persisted so the layout survives reloads.
    const nextWidth = clamp(initialWidth + moveEvent.clientX - startX, minWidth, maxWidth);
    if (target === "sidebar") {
      state.readerSidebarWidth = nextWidth;
      localStorage.setItem("wordMarkerReaderSidebarWidth", String(nextWidth));
    } else if (target === "info") {
      state.readerInfoWidth = nextWidth;
      localStorage.setItem("wordMarkerReaderInfoWidth", String(nextWidth));
    } else {
      const nextHeight = clamp(initialHeight + moveEvent.clientY - startY, minHeight, maxHeight);
      state.readerPanelWidth = nextWidth;
      state.readerPanelHeight = nextHeight;
      localStorage.setItem("wordMarkerReaderPanelWidth", String(nextWidth));
      localStorage.setItem("wordMarkerReaderPanelHeight", String(nextHeight));
    }
    renderReaderSidebar();
  }

  // End reader resizing and remove document-level listeners.
  function stopResize() {
    document.removeEventListener("pointermove", resize);
    document.removeEventListener("pointerup", stopResize);
    document.body.classList.remove("is-resizing-reader");
  }

  document.body.classList.add("is-resizing-reader");
  document.addEventListener("pointermove", resize);
  document.addEventListener("pointerup", stopResize);
}

function closeReaderWordInfo() {
  renderReaderWordInfo(null);
  elements.readerText.querySelectorAll(".reader-token").forEach((entry) => entry.classList.remove("is-selected"));
}

async function markCurrentReaderPageKnown() {
  if (!state.readerAutoMarkKnownOnPageTurn) {
    return false;
  }
  const wordIds = [...new Set(state.readerTokens.filter((token) => token.wordId && !token.known).map((token) => token.wordId))];
  if (!wordIds.length) {
    return false;
  }
  await Promise.all(
    wordIds.map((wordId) =>
      requestJson(`/api/words/${wordId}`, {
        method: "PATCH",
        body: JSON.stringify({ known: true })
      })
    )
  );
  state.readerTokens = state.readerTokens.map((token) => (wordIds.includes(token.wordId) ? { ...token, known: true } : token));
  return true;
}

// Load words for the selected collection and active search term.
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

// Bind all form, navigation, reader, and collection event handlers.
function bindEvents() {
  // Event handlers are centralized here; view modules only render DOM.
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

  elements.tabButtons.forEach((button) => {
    button.addEventListener("click", () => activateTab(button.dataset.tab));
  });

  elements.authModeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.authMode = button.dataset.authMode;
      elements.authStatus.textContent = "";
      renderAuthMode();
    });
  });

  elements.localeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.locale = button.dataset.locale;
      localStorage.setItem("wordMarkerLocale", state.locale);
      applyLocale();
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
    const button = event.target.closest("[data-language-name]");
    if (!button) {
      return;
    }
    button.disabled = true;
    try {
      await setStudyLanguage(button.dataset.languageName, { persist: true, reload: false });
      showView("app");
      await loadDashboard();
    } catch (error) {
      elements.onboardingStatus.textContent = error.message;
    } finally {
      button.disabled = false;
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

  elements.settingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    elements.settingsStatus.textContent = t("settings.saving");
    const submitButton = elements.settingsForm.querySelector("button");
    submitButton.disabled = true;
    try {
      const result = await requestJson("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ nativeLanguage: elements.nativeLanguageSelect.value })
      });
      state.user = result.user;
      state.nativeLanguageOptions = result.nativeLanguageOptions || state.nativeLanguageOptions;
      renderSettings();
      elements.settingsStatus.textContent = t("settings.saved");
      state.selectedMaterialId = null;
      state.currentMaterial = null;
      state.readerTokens = [];
      await loadDashboard();
    } catch (error) {
      elements.settingsStatus.textContent = error.message;
    } finally {
      submitButton.disabled = false;
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

  elements.readerSidebarToggle.addEventListener("click", () => {
    state.readerSidebarCollapsed = !state.readerSidebarCollapsed;
    localStorage.setItem("wordMarkerReaderSidebarCollapsed", String(state.readerSidebarCollapsed));
    renderReaderSidebar();
  });

  elements.readerSidebarOpen.addEventListener("click", () => {
    state.readerSidebarCollapsed = false;
    localStorage.setItem("wordMarkerReaderSidebarCollapsed", String(state.readerSidebarCollapsed));
    renderReaderSidebar();
  });

  elements.readerSidebarResize.addEventListener("pointerdown", (event) => startReaderResize(event, "sidebar"));
  elements.readerPanelResize.addEventListener("pointerdown", (event) => startReaderResize(event, "panel"));

  elements.readerSidebarTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-reader-sidebar-tab]");
    if (!button) {
      return;
    }
    state.readerSidebarTab = button.dataset.readerSidebarTab;
    renderReaderSidebarTabs();
  });

  elements.readerAutoMarkKnown.addEventListener("change", (event) => {
    state.readerAutoMarkKnownOnPageTurn = event.target.checked;
    localStorage.setItem("wordMarkerReaderAutoMarkKnownOnPageTurn", String(state.readerAutoMarkKnownOnPageTurn));
    renderReaderSidebarTabs();
  });

  elements.materialImportForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const file = elements.materialFile.files[0];
    if (!file) {
      elements.materialImportStatus.textContent = t("reader.chooseFile");
      return;
    }
    const submitButton = elements.materialImportForm.querySelector("button");
    submitButton.disabled = true;
    elements.materialImportStatus.textContent = t("reader.importing");
    try {
      const form = new FormData();
      form.append("languageId", String(state.selectedStudyLanguageId));
      form.append("file", file);
      const response = await fetch("/api/materials", { method: "POST", body: form });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || t("errors.requestFailed"));
      }
      elements.materialImportForm.reset();
      elements.materialImportStatus.textContent = t("reader.imported", { words: formatCount(payload.tokenCount) });
      state.selectedMaterialId = payload.material.id;
      await loadMaterials(true);
      await loadMaterialReader(0);
      await loadDashboard();
    } catch (error) {
      elements.materialImportStatus.textContent = error.message;
    } finally {
      submitButton.disabled = false;
    }
  });

  elements.materialList.addEventListener("scroll", async () => {
    const remainingScroll = elements.materialList.scrollHeight - elements.materialList.scrollTop - elements.materialList.clientHeight;
    if (remainingScroll < 120) {
      await loadMaterials(false);
    }
  });

  elements.materialList.addEventListener("click", async (event) => {
    const deleteButton = event.target.closest("[data-delete-material-id]");
    if (deleteButton) {
      const materialId = Number(deleteButton.dataset.deleteMaterialId);
      const material = state.materials.find((entry) => entry.id === materialId);
      if (!material || !confirm(t("reader.deleteMaterialConfirm", { title: material.title }))) {
        return;
      }
      deleteButton.disabled = true;
      try {
        await requestJson(`/api/materials/${materialId}`, { method: "DELETE" });
        state.materials = state.materials.filter((entry) => entry.id !== materialId);
        if (state.selectedMaterialId === materialId) {
          state.selectedMaterialId = null;
          state.currentMaterial = null;
          state.readerTokens = [];
          state.readerStart = 0;
        }
        elements.materialImportStatus.textContent = t("reader.deletedMaterial");
        renderMaterialList();
        renderReaderTokens();
        await loadDashboard();
      } catch (error) {
        elements.materialImportStatus.textContent = error.message;
        deleteButton.disabled = false;
      }
      return;
    }

    const button = event.target.closest("[data-material-id]");
    if (!button) {
      return;
    }
    const material = state.materials.find((entry) => entry.id === Number(button.dataset.materialId));
    if (material?.translationStatus && !material.translationStatus.ready) {
      elements.materialImportStatus.textContent = t("reader.translatingWait");
      return;
    }
    state.selectedMaterialId = Number(button.dataset.materialId);
    state.readerStart = 0;
    renderMaterialList();
    await loadMaterialReader(0);
  });

  elements.readerFontSize.addEventListener("input", (event) => {
    state.readerFontSize = Number(event.target.value);
    localStorage.setItem("wordMarkerReaderFontSize", String(state.readerFontSize));
    renderReaderTokens();
  });

  elements.readerWordsPerPage.addEventListener("change", async (event) => {
    state.readerWordsPerPage = Number(event.target.value);
    localStorage.setItem("wordMarkerReaderWordsPerPage", String(state.readerWordsPerPage));
    await loadMaterialReader(0);
  });

  elements.readerPrevPage.addEventListener("click", async () => {
    const markedKnown = await markCurrentReaderPageKnown();
    await loadMaterialReader(Math.max(state.readerStart - state.readerWordsPerPage, 0));
    if (markedKnown) {
      await loadDashboard();
    }
  });

  elements.readerNextPage.addEventListener("click", async () => {
    const markedKnown = await markCurrentReaderPageKnown();
    await loadMaterialReader(state.readerStart + state.readerWordsPerPage);
    if (markedKnown) {
      await loadDashboard();
    }
  });

  elements.readerText.addEventListener("click", (event) => {
    const button = event.target.closest("[data-token-id]");
    if (!button) {
      return;
    }
    elements.readerText.querySelectorAll(".reader-token").forEach((entry) => entry.classList.remove("is-selected"));
    button.classList.add("is-selected");
    const token = state.readerTokens.find((entry) => entry.id === Number(button.dataset.tokenId));
    renderReaderWordInfo(token, button);
  });

  elements.readerWordInfo.addEventListener("click", async (event) => {
    if (event.target.closest("[data-reader-word-info-close]")) {
      closeReaderWordInfo();
      return;
    }
    const button = event.target.closest("[data-reader-word-id]");
    if (!button) {
      return;
    }
    const known = button.dataset.known !== "true";
    button.disabled = true;
    try {
      await requestJson(`/api/words/${button.dataset.readerWordId}`, {
        method: "PATCH",
        body: JSON.stringify({ known })
      });
      await loadMaterialReader(state.readerStart);
      closeReaderWordInfo();
      await loadDashboard();
    } finally {
      button.disabled = false;
    }
  });

  document.addEventListener("click", (event) => {
    if (elements.readerWordInfo.hidden || elements.readerWordInfo.contains(event.target) || event.target.closest(".reader-token")) {
      return;
    }
    closeReaderWordInfo();
  });

  elements.readerWordInfo.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".reader-word-info-resize")) {
      startReaderResize(event, "info");
    }
  });

  elements.studyLanguageSelect.addEventListener("change", async (event) => {
    await setStudyLanguage(event.target.value);
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

  window.addEventListener("storage", async (event) => {
    if (event.key !== "wordMarkerStudyLanguageName" || !event.newValue || !state.user) {
      return;
    }
    if (event.newValue === state.selectedStudyLanguageName) {
      return;
    }
    await setStudyLanguage(event.newValue, { persist: false });
  });

  window.addEventListener("resize", renderReaderSidebar);
}

setUnauthorizedHandler(() => showView("auth"));
bindEvents();
await loadMessages();
applyLocale();
renderReaderSidebarTabs();
renderAuthMode();
await loadSession();
