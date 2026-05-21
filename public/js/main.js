import { requestJson, setUnauthorizedHandler } from "./api.js";
import { parseCsv } from "./csv.js";
import { elements } from "./dom.js";
import { formatCount, loadMessages, t } from "./i18n.js";
import { escapeHtml } from "./shared/html.js";
import { state } from "./state.js";
import { renderAuthMode } from "./views/auth.js";
import { renderDashboard, renderSelectedCollectionStats } from "./views/dashboard.js";
import { renderOnboarding } from "./views/onboarding.js";
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
  if (state.dashboard) {
    renderDashboard();
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

async function loadSession() {
  const result = await requestJson("/api/auth/me");
  state.user = result.user;
  state.predefinedLanguages = result.predefinedLanguages || [];
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
  const languages = result.languages || [];
  const savedLanguageId = Number(localStorage.getItem("wordMarkerLearningLanguageId")) || null;
  state.selectedDashboardLanguageId = languages.some((language) => language.id === savedLanguageId) ? savedLanguageId : languages[0]?.id || null;
  showView("app");
  setActiveTab(state.activeTab);
  renderSettings();
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
}

setUnauthorizedHandler(() => showView("auth"));
bindEvents();
await loadMessages();
applyLocale();
renderAuthMode();
await loadSession();
