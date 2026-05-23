import { requestJson, setUnauthorizedHandler } from "./api.js";
import { parseCsv } from "./csv.js";
import { elements } from "./dom.js";
import { formatCount, loadMessages, t } from "./i18n.js";
import { escapeHtml } from "./shared/html.js";
import { state } from "./state.js";
import { renderAuthMode } from "./views/auth.js";
import { renderDashboard, renderSelectedCollectionStats } from "./views/dashboard.js";
import { renderOnboarding } from "./views/onboarding.js";
import { renderMaterialList, renderReaderSidebar, renderReaderTokens, renderReaderWordInfo } from "./views/reader.js";
import { renderDisplayModeButtons, renderLocaleButtons, resetWordWindow, setActiveTab, showView } from "./views/shell.js";
import { loadMoreWordsIfNeeded, renderWords } from "./views/words.js";

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
    renderMaterialList();
    renderReaderTokens();
    renderWords(state.words);
  }
}

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

function studyLanguageLabel(language) {
  return t(`studyLanguage.${language}`);
}

function availableStudyLanguages() {
  return state.studyLanguageOptions
    .map((name) => state.languages.find((language) => language.name.toLowerCase() === name.toLowerCase()))
    .filter(Boolean);
}

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

function languageByName(languages, name) {
  return languages.find((language) => language.name.toLowerCase() === name.toLowerCase());
}

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
    state.selectedCollectionId = null;
    state.selectedMaterialId = null;
    state.currentMaterial = null;
    state.readerTokens = [];
    state.readerStart = 0;
    resetWordWindow();
    await loadDashboard();
  }
}

async function loadSession() {
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
  setActiveTab(state.activeTab);
  renderSettings();
  await setStudyLanguage(state.selectedStudyLanguageName, { persist: true, reload: false });
  await loadDashboard();
}

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
  await loadMaterials(true);
  await loadWords();
}

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
  state.readerTokens = result.tokens;
  renderReaderTokens();
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function startReaderResize(event, target) {
  event.preventDefault();
  const startX = event.clientX;
  const startY = event.clientY;
  const initialWidth = target === "sidebar" ? state.readerSidebarWidth : target === "info" ? state.readerInfoWidth : elements.readerLayout.getBoundingClientRect().width;
  const initialHeight = elements.readerLayout.getBoundingClientRect().height;
  const minWidth = target === "sidebar" ? 240 : target === "info" ? 220 : 360;
  const maxWidth = target === "panel" ? window.innerWidth : Math.max(minWidth, Math.floor(window.innerWidth * 0.55));
  const minHeight = 320;
  const maxHeight = Math.max(minHeight, window.innerHeight - 90);

  function resize(moveEvent) {
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

  function stopResize() {
    document.removeEventListener("pointermove", resize);
    document.removeEventListener("pointerup", stopResize);
    document.body.classList.remove("is-resizing-reader");
  }

  document.body.classList.add("is-resizing-reader");
  document.addEventListener("pointermove", resize);
  document.addEventListener("pointerup", stopResize);
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

function bindEvents() {
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
    const button = event.target.closest("[data-material-id]");
    if (!button) {
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
    await loadMaterialReader(Math.max(state.readerStart - state.readerWordsPerPage, 0));
  });

  elements.readerNextPage.addEventListener("click", async () => {
    await loadMaterialReader(state.readerStart + state.readerWordsPerPage);
  });

  elements.readerText.addEventListener("click", (event) => {
    const button = event.target.closest("[data-token-id]");
    if (!button) {
      return;
    }
    elements.readerText.querySelectorAll(".reader-token").forEach((entry) => entry.classList.remove("is-selected"));
    button.classList.add("is-selected");
    const token = state.readerTokens.find((entry) => entry.id === Number(button.dataset.tokenId));
    renderReaderWordInfo(token);
  });

  elements.readerWordInfo.addEventListener("click", async (event) => {
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
      await loadDashboard();
    } finally {
      button.disabled = false;
    }
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
}

setUnauthorizedHandler(() => showView("auth"));
bindEvents();
await loadMessages();
applyLocale();
renderAuthMode();
await loadSession();
