import { elements } from "../dom.js";
import { formatCount, t } from "../i18n.js";
import { escapeHtml } from "../shared/html.js";
import { state } from "../state.js";

function practiceWordsPerSession() {
  return Number(state.user?.practiceWordsPerSession) || 20;
}

function renderPracticeShell(activePanel, content) {
  const tab = (id, labelKey) => {
    const active = activePanel === id;
    return `
      <button class="practice-sidebar-button rounded-md px-3 py-2 text-sm font-semibold text-secondary" type="button" data-practice-panel="${id}" aria-current="${active ? "page" : "false"}">
        ${escapeHtml(t(labelKey))}
      </button>
    `;
  };
  elements.practiceContent.innerHTML = `
    <section class="practice-layout grid items-start gap-3.5">
      <aside class="practice-sidebar rounded-lg border border-line bg-panel p-3.5 shadow-panel">
        <nav class="practice-sidebar-menu grid gap-1" aria-label="${escapeHtml(t("practice.sidebarLabel"))}">
          ${tab("practice", "practice.practiceTab")}
          ${tab("settings", "practice.settingsTab")}
        </nav>
      </aside>
      <div class="practice-main min-w-0">${content}</div>
    </section>
  `;
}

function cardTextSize(text, maxRem = 4.5) {
  const length = [...String(text || "")].reduce((total, char) => total + (/\s/.test(char) ? 0.45 : 1), 0);
  if (length <= 16) return maxRem;
  if (length <= 40) return Math.max(2.2, maxRem - (length - 16) * 0.08);
  return Math.max(1.15, 2.2 - (length - 40) * 0.018);
}

function cardTextStyle(text, maxRem) {
  return `--practice-card-text-size:${cardTextSize(text, maxRem).toFixed(2)}rem`;
}

// Landing page: explain practice and offer to start a session.
export function renderPracticeLanding(activePanel = "practice") {
  const language = state.selectedStudyLanguageName ? t(`studyLanguage.${state.selectedStudyLanguageName}`, {}, state.selectedStudyLanguageName) : "";
  if (activePanel === "settings") {
    renderPracticeSettings();
    return;
  }
  renderPracticeShell(activePanel, `
    <section class="practice-panel rounded-lg border border-line bg-panel p-6 shadow-panel">
      <h2 class="text-2xl font-bold tracking-tight">${escapeHtml(t("practice.title"))}</h2>
      <p class="mt-2 text-sm text-secondary">${escapeHtml(t("practice.intro"))}</p>
      <dl class="practice-summary-list mt-5 grid gap-2 text-sm">
        <div class="flex items-center justify-between gap-3 rounded-md border border-line bg-subtle px-4 py-3">
          <dt class="font-semibold text-label">${escapeHtml(t("practice.studyLanguage"))}</dt>
          <dd class="font-bold text-main">${escapeHtml(language || t("practice.noLanguage"))}</dd>
        </div>
        <div class="flex items-center justify-between gap-3 rounded-md border border-line bg-subtle px-4 py-3">
          <dt class="font-semibold text-label">${escapeHtml(t("practice.wordsPerSession"))}</dt>
          <dd class="font-bold text-main">${formatCount(practiceWordsPerSession())}</dd>
        </div>
      </dl>
      <button class="practice-start-button mt-6 min-h-12 w-full rounded-md bg-brand px-4 text-base font-bold text-white hover:bg-brand-strong disabled:opacity-50 disabled:cursor-not-allowed" type="button" data-practice-start ${state.selectedStudyLanguageId ? "" : "disabled"}>
        ${escapeHtml(t("practice.start"))}
      </button>
      <p id="practiceStatus" class="status mt-3 min-h-5 text-sm text-secondary" role="status"></p>
    </section>
  `);
}

export function renderPracticeSettings() {
  renderPracticeShell("settings", `
    <section class="practice-panel rounded-lg border border-line bg-panel p-6 shadow-panel">
      <h2 class="text-2xl font-bold tracking-tight">${escapeHtml(t("practice.settingsTitle"))}</h2>
      <p class="mt-2 text-sm text-secondary">${escapeHtml(t("practice.settingsIntro"))}</p>
      <form id="practiceSettingsForm" class="mt-5 grid gap-4">
        <label class="grid gap-1.5 text-sm font-semibold text-label">
          <span>${escapeHtml(t("settings.practiceWordsPerSession"))}</span>
          <input id="practiceWordsPerSession" class="min-h-11 rounded-md border border-line bg-panel px-3 text-main outline-none focus:border-brand focus:ring-2 focus:ring-focus" type="number" min="1" max="200" step="1" value="${escapeHtml(String(practiceWordsPerSession()))}" />
        </label>
        <p class="hint min-h-5 text-sm text-secondary">${escapeHtml(t("settings.practiceWordsPerSessionHint"))}</p>
        <button class="min-h-11 rounded-md bg-brand px-4 text-sm font-bold text-white hover:bg-brand-strong" type="submit">
          ${escapeHtml(t("settings.save"))}
        </button>
        <p id="practiceSettingsStatus" class="status min-h-5 text-sm text-secondary" role="status"></p>
      </form>
    </section>
  `);
}

export function setPracticeStatus(message) {
  const status = elements.practiceContent.querySelector("#practiceStatus");
  if (status) {
    status.textContent = message;
  }
}

// No learning words at all are available to study.
export function renderPracticeEmpty(activePanel = "practice") {
  renderPracticeShell(activePanel, `
    <section class="practice-panel rounded-lg border border-line bg-panel p-6 shadow-panel text-center">
      <h2 class="text-2xl font-bold tracking-tight">${escapeHtml(t("practice.title"))}</h2>
      <p class="mt-3 text-sm text-secondary">${escapeHtml(t("practice.emptyBody"))}</p>
      <button class="practice-secondary-button mt-6 min-h-11 rounded-md border border-line bg-panel px-5 text-sm font-bold text-brand hover:bg-hover" type="button" data-practice-done>
        ${escapeHtml(t("practice.back"))}
      </button>
    </section>
  `);
}

// Fewer valid words than requested: let the user start with what is available.
export function renderPracticeNotice(session, activePanel = "practice") {
  renderPracticeShell(activePanel, `
    <section class="practice-panel rounded-lg border border-line bg-panel p-6 shadow-panel text-center">
      <h2 class="text-2xl font-bold tracking-tight">${escapeHtml(t("practice.title"))}</h2>
      <p class="mt-3 text-sm text-secondary">${escapeHtml(t("practice.onlyValid", { count: formatCount(session.validCount) }))}</p>
      <div class="practice-notice-actions mt-6 flex flex-wrap justify-center gap-3">
        <button class="practice-start-button min-h-11 rounded-md bg-brand px-6 text-sm font-bold text-white hover:bg-brand-strong" type="button" data-practice-begin>
          ${escapeHtml(t("practice.startWith", { count: formatCount(session.words.length) }))}
        </button>
        <button class="practice-secondary-button min-h-11 rounded-md border border-line bg-panel px-5 text-sm font-bold text-brand hover:bg-hover" type="button" data-practice-done>
          ${escapeHtml(t("practice.back"))}
        </button>
      </div>
    </section>
  `);
}

// One flashcard. `flipped` reveals the translation side and enables the answers.
export function renderPracticeCard(session, index, flipped) {
  const card = session.words[index];
  const total = session.words.length;
  const phonetic = card.reading || card.pinyin || "";
  const translation = card.translation || t("practice.noTranslation");
  const answered = Boolean(session.answers?.[index]);
  const canGoPrevious = index > 0;
  const canGoNext = answered && index + 1 < total;
  elements.practiceContent.innerHTML = `
    <section class="practice-session">
      <div class="practice-session-head mb-4 flex items-center justify-between gap-3">
        <button class="practice-secondary-button min-h-10 rounded-md border border-line bg-panel px-4 text-sm font-bold text-brand hover:bg-hover" type="button" data-practice-done>
          ${escapeHtml(t("practice.exit"))}
        </button>
        <span class="practice-progress text-sm font-semibold text-secondary" role="status">${escapeHtml(t("practice.progress", { current: formatCount(index + 1), total: formatCount(total) }))}</span>
      </div>
      <div class="practice-card-stage">
        <button class="practice-card-side-button practice-card-side-button-prev practice-secondary-button rounded-md border border-line bg-panel text-brand hover:bg-hover disabled:opacity-40 disabled:cursor-not-allowed" type="button" data-practice-previous aria-label="${escapeHtml(t("practice.previous"))}" title="${escapeHtml(t("practice.previous"))}" ${canGoPrevious ? "" : "disabled"}>
          <span aria-hidden="true">&larr;</span>
        </button>
        <div class="practice-card-wrap">
        <div class="practice-card${flipped ? " is-flipped" : ""}" data-practice-card tabindex="0" role="button" aria-label="${escapeHtml(t("practice.flipHint"))}">
          <div class="practice-card-face practice-card-front">
            <span class="practice-card-word" style="${escapeHtml(cardTextStyle(card.word, 4.5))}">${escapeHtml(card.word)}</span>
            <span class="practice-card-hint">${escapeHtml(t("practice.flipHint"))}</span>
          </div>
          <div class="practice-card-face practice-card-back">
            <span class="practice-card-translation" style="${escapeHtml(cardTextStyle(translation, 4.1))}">${escapeHtml(translation)}</span>
            ${phonetic ? `<span class="practice-card-phonetic">${escapeHtml(phonetic)}</span>` : ""}
          </div>
        </div>
        </div>
        <button class="practice-card-side-button practice-card-side-button-next practice-secondary-button rounded-md border border-line bg-panel text-brand hover:bg-hover disabled:opacity-40 disabled:cursor-not-allowed" type="button" data-practice-next aria-label="${escapeHtml(t("practice.next"))}" title="${escapeHtml(t("practice.next"))}" ${canGoNext ? "" : "disabled"}>
          <span aria-hidden="true">&rarr;</span>
        </button>
      </div>
      <div class="practice-answer mt-6 grid grid-cols-2 gap-3">
        <button class="practice-answer-button is-unknown min-h-12 rounded-md border text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed" type="button" data-practice-answer="unknown" ${flipped ? "" : "disabled"}>
          ${escapeHtml(t("practice.dontKnow"))}
        </button>
        <button class="practice-answer-button is-known min-h-12 rounded-md border text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed" type="button" data-practice-answer="known" ${flipped ? "" : "disabled"}>
          ${escapeHtml(t("practice.know"))}
        </button>
      </div>
    </section>
  `;
}

// End-of-session results.
export function renderPracticeSummary(results) {
  const total = results.known + results.unknown;
  elements.practiceContent.innerHTML = `
    <section class="practice-panel rounded-lg border border-line bg-panel p-6 shadow-panel text-center">
      <h2 class="text-2xl font-bold tracking-tight">${escapeHtml(t("practice.doneTitle"))}</h2>
      <p class="mt-2 text-sm text-secondary">${escapeHtml(t("practice.doneBody", { total: formatCount(total) }))}</p>
      <dl class="practice-summary-list mt-5 grid gap-2 text-sm">
        <div class="flex items-center justify-between gap-3 rounded-md border border-line bg-subtle px-4 py-3">
          <dt class="font-semibold text-label">${escapeHtml(t("practice.knownCount"))}</dt>
          <dd class="font-bold text-brand">${formatCount(results.known)}</dd>
        </div>
        <div class="flex items-center justify-between gap-3 rounded-md border border-line bg-subtle px-4 py-3">
          <dt class="font-semibold text-label">${escapeHtml(t("practice.learningCount"))}</dt>
          <dd class="font-bold text-main">${formatCount(results.unknown)}</dd>
        </div>
      </dl>
      <div class="practice-notice-actions mt-6 flex flex-wrap justify-center gap-3">
        <button class="practice-start-button min-h-11 rounded-md bg-brand px-6 text-sm font-bold text-white hover:bg-brand-strong" type="button" data-practice-start>
          ${escapeHtml(t("practice.again"))}
        </button>
        <button class="practice-secondary-button min-h-11 rounded-md border border-line bg-panel px-5 text-sm font-bold text-brand hover:bg-hover" type="button" data-practice-done>
          ${escapeHtml(t("practice.back"))}
        </button>
      </div>
    </section>
  `;
}
