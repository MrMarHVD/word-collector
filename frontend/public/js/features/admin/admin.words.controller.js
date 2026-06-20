/**
 * @fileoverview Admin "Words" panel controller (issue ADM-003).
 *
 * Owns the behaviour of the Admin → Words panel: a mutually-exclusive source-
 * language picker, a native-language selector (default English), word/lemma
 * search, infinite scroll over the global word catalogue, and inline editable
 * canonical-translation cells (including empty cells to seed missing
 * translations). It talks to the `/api/admin/words/*` endpoints via the shared
 * `requestJson` client and edits only the shared canonical translation; per-user
 * overrides are never touched. The delegating admin controller invokes this
 * panel through {@link renderAdminWordsPanel}, re-exported by the view-module.
 */

import { requestJson } from "../../api.js";
import { elements } from "../../dom.js";
import { t } from "../../i18n.js";

const PAGE_SIZE = 50;

// Panel-local UI state. Recreated each time the panel is (re-)rendered.
const panelState = {
  languageId: null,
  nativeLanguage: "English",
  search: "",
  cursor: null,
  loading: false,
  done: false
};

let listEl = null;
let sentinelEl = null;
let observer = null;
let searchTimer = null;

/**
 * Render the Admin → Words panel: load the source languages and native-language
 * options, build the controls and list scaffolding, then load the first page for
 * the default selection. Safe to call repeatedly; it rebuilds from a clean slate.
 *
 * @returns {Promise<void>}
 */
export async function renderAdminWordsPanel() {
  const panel = elements.adminWordsPanel;
  if (!panel) {
    return;
  }
  teardown();
  panel.replaceChildren(buildLoading());

  let meta;
  try {
    meta = await requestJson("/api/admin/words/languages");
  } catch (error) {
    panel.replaceChildren(buildMessage(error.message || t("admin.words.loadError")));
    return;
  }

  const languages = Array.isArray(meta.languages) ? meta.languages : [];
  const nativeOptions = Array.isArray(meta.nativeLanguageOptions) && meta.nativeLanguageOptions.length
    ? meta.nativeLanguageOptions
    : ["English"];

  panelState.nativeLanguage = nativeOptions.includes("English") ? "English" : nativeOptions[0];
  panelState.languageId = languages[0]?.id ?? null;
  panelState.search = "";
  resetPaging();

  panel.replaceChildren(buildPanel(languages, nativeOptions));

  if (panelState.languageId == null) {
    listEl.replaceChildren(buildMessage(t("admin.words.noLanguages")));
    return;
  }
  await loadFirstPage();
}

// Build the full panel layout for the loaded metadata.
function buildPanel(languages, nativeOptions) {
  const root = document.createElement("div");
  root.className = "admin-words grid gap-4";

  const heading = document.createElement("div");
  heading.className = "grid gap-1";
  const title = document.createElement("h2");
  title.className = "text-base font-bold";
  title.textContent = t("admin.words.title");
  const subtitle = document.createElement("p");
  subtitle.className = "text-sm text-secondary";
  subtitle.textContent = t("admin.words.subtitle");
  heading.append(title, subtitle);

  const controls = document.createElement("div");
  controls.className = "grid gap-3";
  controls.append(
    buildLanguagePicker(languages),
    buildSecondaryControls(nativeOptions)
  );

  listEl = document.createElement("div");
  listEl.className = "admin-words-list max-h-[28rem] overflow-y-auto rounded-md border border-line";

  sentinelEl = document.createElement("div");
  sentinelEl.className = "admin-words-sentinel h-px w-full";

  root.append(heading, controls, listEl);
  return root;
}

// Mutually-exclusive source-language picker (single active button at a time).
function buildLanguagePicker(languages) {
  const wrapper = document.createElement("div");
  wrapper.className = "grid gap-1.5";
  const label = document.createElement("span");
  label.className = "text-sm font-semibold text-label";
  label.textContent = t("admin.words.sourceLanguage");
  const group = document.createElement("div");
  group.className = "admin-words-languages flex flex-wrap gap-1 rounded-lg border border-line bg-muted p-1";
  group.setAttribute("role", "radiogroup");

  for (const language of languages) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "admin-words-language rounded-md px-3 py-1.5 text-sm font-semibold text-secondary";
    button.setAttribute("role", "radio");
    button.dataset.languageId = String(language.id);
    button.textContent = language.name;
    const active = language.id === panelState.languageId;
    button.setAttribute("aria-checked", String(active));
    if (active) {
      button.classList.add("is-active", "bg-panel", "text-main", "shadow-panel");
    }
    button.addEventListener("click", () => selectLanguage(language.id, group));
    group.append(button);
  }

  wrapper.append(label, group);
  return wrapper;
}

// Native-language selector (default English) plus the word/lemma search box.
function buildSecondaryControls(nativeOptions) {
  const row = document.createElement("div");
  row.className = "flex flex-col gap-3 sm:flex-row sm:items-end";

  const nativeField = document.createElement("label");
  nativeField.className = "grid gap-1.5 text-sm font-semibold text-label sm:w-48";
  const nativeLabel = document.createElement("span");
  nativeLabel.textContent = t("admin.words.nativeLanguage");
  const select = document.createElement("select");
  select.className = "admin-words-native min-h-11 rounded-md border border-line bg-panel px-3 text-main outline-none focus:border-brand focus:ring-2 focus:ring-focus";
  for (const option of nativeOptions) {
    const opt = document.createElement("option");
    opt.value = option;
    opt.textContent = option;
    if (option === panelState.nativeLanguage) {
      opt.selected = true;
    }
    select.append(opt);
  }
  select.addEventListener("change", () => {
    panelState.nativeLanguage = select.value;
    loadFirstPage();
  });
  nativeField.append(nativeLabel, select);

  const searchField = document.createElement("label");
  searchField.className = "grid gap-1.5 text-sm font-semibold text-label sm:flex-1";
  const searchLabel = document.createElement("span");
  searchLabel.textContent = t("admin.words.search");
  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.className = "admin-words-search min-h-11 rounded-md border border-line bg-panel px-3 text-main outline-none focus:border-brand focus:ring-2 focus:ring-focus";
  searchInput.placeholder = t("admin.words.searchPlaceholder");
  searchInput.addEventListener("input", () => {
    panelState.search = searchInput.value.trim();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadFirstPage(), 250);
  });
  searchField.append(searchLabel, searchInput);

  row.append(nativeField, searchField);
  return row;
}

// Activate a source language and reload from the top.
function selectLanguage(languageId, group) {
  if (languageId === panelState.languageId) {
    return;
  }
  panelState.languageId = languageId;
  for (const button of group.querySelectorAll(".admin-words-language")) {
    const active = Number(button.dataset.languageId) === languageId;
    button.setAttribute("aria-checked", String(active));
    button.classList.toggle("is-active", active);
    button.classList.toggle("bg-panel", active);
    button.classList.toggle("text-main", active);
    button.classList.toggle("shadow-panel", active);
  }
  loadFirstPage();
}

// Reset paging cursors and reload the first page into a fresh list.
async function loadFirstPage() {
  resetPaging();
  disconnectObserver();
  listEl.replaceChildren(buildLoading());
  const rows = await fetchPage();
  if (rows === null) {
    return;
  }
  listEl.replaceChildren();
  if (!rows.length) {
    listEl.append(buildMessage(t("admin.words.noWords")));
    return;
  }
  appendRows(rows);
  attachSentinel();
}

// Load the next page when the sentinel scrolls into view.
async function loadMore() {
  if (panelState.loading || panelState.done) {
    return;
  }
  const rows = await fetchPage();
  if (rows === null || !rows.length) {
    return;
  }
  // Keep the sentinel at the end of the list as new rows arrive.
  if (sentinelEl?.parentNode) {
    sentinelEl.remove();
  }
  appendRows(rows);
  attachSentinel();
}

// Fetch the current page from the API; returns rows, or null on error.
async function fetchPage() {
  if (panelState.languageId == null) {
    return [];
  }
  panelState.loading = true;
  const params = new URLSearchParams({
    languageId: String(panelState.languageId),
    native: panelState.nativeLanguage,
    limit: String(PAGE_SIZE)
  });
  if (panelState.search) {
    params.set("search", panelState.search);
  }
  if (panelState.cursor) {
    params.set("cursor", panelState.cursor);
  }
  try {
    const payload = await requestJson(`/api/admin/words?${params.toString()}`);
    panelState.cursor = payload.nextCursor || null;
    panelState.done = !payload.nextCursor;
    return Array.isArray(payload.words) ? payload.words : [];
  } catch (error) {
    listEl.append(buildMessage(error.message || t("admin.words.loadError")));
    panelState.done = true;
    return null;
  } finally {
    panelState.loading = false;
  }
}

// Append word rows with inline-editable canonical-translation cells.
function appendRows(rows) {
  for (const row of rows) {
    listEl.append(buildRow(row));
  }
}

function buildRow(word) {
  const item = document.createElement("div");
  item.className = "admin-words-row flex items-center gap-3 border-b border-line px-3 py-2 last:border-b-0";
  item.dataset.wordId = String(word.id);

  const term = document.createElement("div");
  term.className = "admin-words-term min-w-0 flex-1";
  const surface = document.createElement("div");
  surface.className = "truncate text-sm font-semibold text-main";
  surface.textContent = word.word;
  term.append(surface);
  if (word.lemma && word.lemma !== word.word) {
    const lemma = document.createElement("div");
    lemma.className = "truncate text-xs text-secondary";
    lemma.textContent = word.lemma;
    term.append(lemma);
  }

  const input = document.createElement("input");
  input.type = "text";
  input.className = "admin-words-translation min-h-9 flex-1 rounded-md border border-line bg-panel px-2 text-sm text-main outline-none focus:border-brand focus:ring-2 focus:ring-focus";
  input.value = word.canonicalTranslation || "";
  input.placeholder = t("admin.words.translationPlaceholder");
  input.dataset.original = input.value;
  input.addEventListener("blur", () => saveTranslation(word.id, input));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      input.blur();
    }
  });

  item.append(term, input);
  return item;
}

// Persist an edited canonical translation when it actually changed.
async function saveTranslation(wordId, input) {
  const next = input.value.trim();
  if (next === input.dataset.original) {
    return;
  }
  input.disabled = true;
  try {
    const payload = await requestJson(`/api/admin/words/${wordId}/translation`, {
      method: "PATCH",
      body: JSON.stringify({ native: panelState.nativeLanguage, translation: next })
    });
    const saved = payload.word?.canonicalTranslation ?? next;
    input.value = saved;
    input.dataset.original = saved;
  } catch (error) {
    input.value = input.dataset.original;
    listEl.append(buildMessage(error.message || t("admin.words.saveError")));
  } finally {
    input.disabled = false;
  }
}

function resetPaging() {
  panelState.cursor = null;
  panelState.loading = false;
  panelState.done = false;
}

// Place the sentinel at the end of the list and observe it for infinite scroll.
function attachSentinel() {
  if (panelState.done || !sentinelEl) {
    return;
  }
  listEl.append(sentinelEl);
  disconnectObserver();
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        loadMore();
      }
    },
    { root: listEl, rootMargin: "120px" }
  );
  observer.observe(sentinelEl);
}

function disconnectObserver() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}

function teardown() {
  disconnectObserver();
  clearTimeout(searchTimer);
}

function buildLoading() {
  return buildMessage(t("admin.words.loading"));
}

function buildMessage(text) {
  const message = document.createElement("p");
  message.className = "admin-words-message px-3 py-4 text-sm text-secondary";
  message.textContent = text;
  return message;
}
