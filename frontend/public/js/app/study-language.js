import { requestJson } from "../api.js";
import { elements } from "../dom.js";
import { t } from "../i18n.js";
import { escapeHtml } from "../shared/html.js";
import { state } from "../state.js";
import { renderReaderSidebarTabs } from "../views/reader.js";
import { resetWordWindow } from "../views/shell.js";
import { flagSvg } from "./flags.js";

let reloadDashboard = async () => {};

export function configureStudyLanguage(options) {
  reloadDashboard = options.reloadDashboard;
}

export function studyLanguageLabel(language) {
  return t(`studyLanguage.${language}`);
}

function studyLanguageAvailableForNativeLanguage(name) {
  return name !== state.user?.nativeLanguage && (state.user?.nativeLanguage === "English" || !["Spanish", "French"].includes(name));
}

function unavailableStudyLanguageReason(name) {
  if (name === state.user?.nativeLanguage) {
    return t("errors.matchingNativeStudyLanguage");
  }
  if (state.user?.nativeLanguage !== "English" && ["Spanish", "French"].includes(name)) {
    return t("errors.invalidNativeStudyLanguage");
  }
  return "";
}

// User-enrolled languages in the canonical study-language order.
export function availableStudyLanguages() {
  return state.studyLanguageOptions
    .map((name) => state.languages.find((language) => language.name.toLowerCase() === name.toLowerCase()))
    .filter(Boolean)
    .filter((language) => studyLanguageAvailableForNativeLanguage(language.name));
}

// Study languages the user has not yet enrolled in.
function studyLanguageDropdownOptions() {
  return state.studyLanguageOptions
    .map((name) => ({
      name,
      enrolled: state.languages.some((language) => language.name.toLowerCase() === name.toLowerCase()),
      reason: unavailableStudyLanguageReason(name)
    }))
    .filter((option) => !option.enrolled || option.reason);
}

export function languageByName(languages, name) {
  return languages.find((language) => language.name.toLowerCase() === name.toLowerCase());
}

export function firstAvailableStudyLanguageAlphabetically() {
  return [...availableStudyLanguages()].sort((left, right) => studyLanguageLabel(left.name).localeCompare(studyLanguageLabel(right.name)))[0] || null;
}

// Render the flag button row and keep the add-button dropdown in sync.
export function renderStudyLanguageSelect() {
  if (!elements.studyLanguageButtons) {
    return;
  }
  const enrolled = availableStudyLanguages();
  elements.studyLanguageButtons.innerHTML = enrolled
    .map((language) => {
      const active = language.id === state.selectedStudyLanguageId;
      const label = studyLanguageLabel(language.name);
      return `
        <button
          class="study-language-button${active ? " is-active" : ""}"
          type="button"
          data-language-name="${escapeHtml(language.name)}"
          aria-pressed="${active}"
          aria-label="${escapeHtml(label)}"
          title="${escapeHtml(label)}"
        >${flagSvg(language.name)}</button>
      `;
    })
    .join("");
  renderStudyLanguageDropdown();
}

function renderStudyLanguageDropdown() {
  if (!elements.studyLanguageDropdown) {
    return;
  }
  const options = studyLanguageDropdownOptions();
  const hasAvailableOption = options.some((option) => !option.enrolled && !option.reason);
  elements.studyLanguageAddButton.disabled = options.length === 0;
  elements.studyLanguageDropdown.innerHTML = options.length
    ? options
        .map(
          ({ name, enrolled, reason }) => `
            <button
              class="study-language-dropdown-item flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm font-semibold ${reason ? "text-secondary" : "text-label hover:bg-hover"}"
              type="button"
              data-language-name="${escapeHtml(name)}"
              ${reason || enrolled ? `data-disabled-reason="${escapeHtml(reason || t("learning.alreadyAdded"))}"` : ""}
              ${reason || enrolled ? `aria-disabled="true" title="${escapeHtml(reason || t("learning.alreadyAdded"))}"` : ""}
            >
              <span class="study-language-dropdown-flag">${flagSvg(name)}</span>
              <span>${escapeHtml(studyLanguageLabel(name))}</span>
            </button>
          `
        )
        .join("")
    : `<p class="px-2 py-2 text-sm text-secondary">${escapeHtml(t("learning.allAdded"))}</p>`;
  if (options.length && !hasAvailableOption) {
    elements.studyLanguageDropdown.insertAdjacentHTML("beforeend", `<p class="px-2 py-2 text-sm text-secondary" data-study-language-menu-status>${escapeHtml(t("learning.noAvailableForNative"))}</p>`);
  }
}

function closeDropdown() {
  elements.studyLanguageDropdown.hidden = true;
  elements.studyLanguageAddButton.setAttribute("aria-expanded", "false");
}

function toggleDropdown() {
  const open = elements.studyLanguageDropdown.hidden;
  elements.studyLanguageDropdown.hidden = !open;
  elements.studyLanguageAddButton.setAttribute("aria-expanded", String(open));
}

export async function setStudyLanguage(languageName, { persist = true, reload = true } = {}) {
  if (!languageName) {
    state.selectedStudyLanguageName = "";
    state.selectedStudyLanguageId = null;
    renderStudyLanguageSelect();
    renderReaderSidebarTabs();
    if (reload) {
      await reloadDashboard();
    }
    return;
  }

  const language = languageByName(state.languages, languageName);
  if (!language) {
    return;
  }
  if (language.name === state.user?.nativeLanguage) {
    return;
  }
  if (!availableStudyLanguages().some((available) => available.id === language.id)) {
    return;
  }
  state.selectedStudyLanguageName = language.name;
  state.selectedStudyLanguageId = language.id;
  if (persist) {
    localStorage.setItem("wordMarkerStudyLanguageName", language.name);
  }
  renderStudyLanguageSelect();
  renderReaderSidebarTabs();
  if (reload) {
    state.selectedCollectionId = "all";
    state.selectedMaterialId = null;
    state.currentMaterial = null;
    state.readerTokens = [];
    state.readerStart = 0;
    resetWordWindow();
    await reloadDashboard();
  }
}

async function addStudyLanguage(name) {
  const result = await requestJson("/api/languages", {
    method: "POST",
    body: JSON.stringify({ name })
  });
  state.languages = result.languages || state.languages;
  state.studyLanguageOptions = result.studyLanguageOptions || state.studyLanguageOptions;
  state.predefinedLanguages = result.predefinedLanguages || state.predefinedLanguages;
  await setStudyLanguage(result.language?.name || name, { persist: true, reload: true });
}

export function bindStudyLanguageEvents() {
  elements.studyLanguageButtons.addEventListener("click", async (event) => {
    const button = event.target.closest(".study-language-button");
    if (!button) {
      return;
    }
    await setStudyLanguage(button.dataset.languageName);
  });

  elements.studyLanguageAddButton.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleDropdown();
  });

  elements.studyLanguageDropdown.addEventListener("click", async (event) => {
    const item = event.target.closest(".study-language-dropdown-item");
    if (!item) {
      return;
    }
    if (item.dataset.disabledReason) {
      const status = elements.studyLanguageDropdown.querySelector("[data-study-language-menu-status]");
      if (status) {
        status.textContent = item.dataset.disabledReason;
      } else {
        elements.studyLanguageDropdown.insertAdjacentHTML("beforeend", `<p class="px-2 py-2 text-sm text-secondary" data-study-language-menu-status>${escapeHtml(item.dataset.disabledReason)}</p>`);
      }
      return;
    }
    closeDropdown();
    item.disabled = true;
    try {
      await addStudyLanguage(item.dataset.languageName);
    } finally {
      item.disabled = false;
    }
  });

  document.addEventListener("click", (event) => {
    if (elements.studyLanguageDropdown.hidden) {
      return;
    }
    if (event.target.closest(".study-language-add-wrap")) {
      return;
    }
    closeDropdown();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.studyLanguageDropdown.hidden) {
      closeDropdown();
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
