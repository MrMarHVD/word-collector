/**
 * @fileoverview Practice feature controller — orchestrates the flashcard
 * practice session lifecycle. Fetches session word lists from the API,
 * manages in-memory session state (current card index, flip state, answers),
 * persists "known" status changes, handles keyboard shortcuts, and saves
 * practice-settings changes (words-per-session).
 */

import { requestJson } from "../../api.js";
import { elements } from "../../dom.js";
import { t } from "../../i18n.js";
import { state } from "../../state.js";
import {
  renderPracticeCard,
  renderPracticeEmpty,
  renderPracticeLanding,
  renderPracticeNotice,
  renderPracticeSettings,
  renderPracticeSummary,
  setPracticeStatus
} from "../../views/practice.js";

let loadDashboard = async () => {};

// In-session state lives here rather than in global state because it is only
// meaningful while the practice tab is mid-session.
const session = {
  active: false,
  words: [],
  answers: [],
  index: 0,
  flipped: false,
  statusChanged: false,
  panel: "practice"
};

/**
 * Injects dependencies that the practice controller needs but cannot import
 * directly (to avoid circular module dependencies).
 *
 * @param {{ loadDashboard: function(): Promise<void> }} options
 * @param {function(): Promise<void>} options.loadDashboard - Reloads dashboard
 *   data when any word status was changed during a session.
 */
export function configurePracticeController(options) {
  loadDashboard = options.loadDashboard;
}

function resetSession() {
  session.active = false;
  session.words = [];
  session.answers = [];
  session.index = 0;
  session.flipped = false;
  session.statusChanged = false;
}

/**
 * Called when the user navigates to the practice tab. When a session is
 * already active it resumes mid-session at the current card; otherwise it
 * resets session state and renders the landing page.
 *
 * @sideeffects
 * - When active: calls {@link renderPracticeCard} with the current session
 *   state.
 * - When inactive: calls `resetSession` then {@link renderPracticeLanding}.
 */
export function enterPracticeTab() {
  if (session.active) {
    renderPracticeCard(session, session.index, session.flipped);
    return;
  }
  resetSession();
  renderPracticeLanding(session.panel);
}

async function fetchSession(mode) {
  const params = new URLSearchParams();
  if (state.selectedStudyLanguageId) {
    params.set("languageId", state.selectedStudyLanguageId);
  }
  if (mode) {
    params.set("mode", mode);
  }
  return requestJson(`/api/practice/session?${params}`);
}

async function startSession(mode) {
  if (!state.selectedStudyLanguageId) {
    return;
  }
  setPracticeStatus(t("practice.loading"));
  let data;
  try {
    data = await fetchSession(mode);
  } catch (error) {
    setPracticeStatus(error.message);
    return;
  }

  if (!data.words.length) {
    // The marked-words flow has its own empty message and keeps the user on the
    // landing page so they can still start an automatic session.
    if (mode === "marked") {
      setPracticeStatus(t("practice.markedEmpty"));
      return;
    }
    resetSession();
    renderPracticeEmpty(session.panel);
    return;
  }

  if (data.insufficient) {
    resetSession();
    session.words = data.words;
    renderPracticeNotice(data, session.panel);
    return;
  }

  beginSession(data.words);
}

function beginSession(words) {
  resetSession();
  session.active = true;
  session.words = words;
  session.answers = new Array(words.length).fill(null);
  renderPracticeCard(session, session.index, session.flipped);
}

// Toggle the card between its front and back so a turned card can be turned back.
function flipCard() {
  if (!session.active) {
    return;
  }
  session.flipped = !session.flipped;
  renderPracticeCard(session, session.index, session.flipped);
}

async function answerCard(answer) {
  if (!session.active || !session.flipped) {
    return;
  }
  const card = session.words[session.index];
  const previousAnswer = session.answers[session.index];
  session.answers[session.index] = answer;
  if (answer === "known" && previousAnswer !== "known") {
    try {
      await requestJson(`/api/words/${card.wordId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "known" })
      });
      session.statusChanged = true;
    } catch {
      // A failed status write should not stall the session; the word simply
      // stays in its current status and can be reviewed again later.
    }
  }

  if (session.index + 1 >= session.words.length) {
    finishSession();
    return;
  }
  session.index += 1;
  session.flipped = Boolean(session.answers[session.index]);
  renderPracticeCard(session, session.index, session.flipped);
}

function previousCard() {
  if (!session.active || session.index <= 0) {
    return;
  }
  session.index -= 1;
  session.flipped = true;
  renderPracticeCard(session, session.index, session.flipped);
}

function nextCard() {
  if (!session.active || !session.answers[session.index] || session.index + 1 >= session.words.length) {
    return;
  }
  session.index += 1;
  session.flipped = Boolean(session.answers[session.index]);
  renderPracticeCard(session, session.index, session.flipped);
}

function finishSession() {
  const results = session.answers.reduce((totals, answer) => {
    if (answer === "known") totals.known += 1;
    if (answer === "unknown") totals.unknown += 1;
    return totals;
  }, { known: 0, unknown: 0 });
  const statusChanged = session.statusChanged;
  resetSession();
  renderPracticeSummary(results);
  if (statusChanged) {
    loadDashboard();
  }
}

async function savePracticeSettings(form) {
  const status = form.querySelector("#practiceSettingsStatus");
  const input = form.querySelector("#practiceWordsPerSession");
  const submitButton = form.querySelector("button");
  status.textContent = t("settings.saving");
  submitButton.disabled = true;
  try {
    const result = await requestJson("/api/settings", {
      method: "PATCH",
      body: JSON.stringify({
        practiceWordsPerSession: input.value
      })
    });
    state.user = result.user;
    state.nativeLanguageOptions = result.nativeLanguageOptions || state.nativeLanguageOptions;
    renderPracticeSettings();
    elements.practiceContent.querySelector("#practiceSettingsStatus").textContent = t("settings.saved");
  } catch (error) {
    status.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
}

/**
 * Attaches all DOM event listeners for the practice feature. Must be called
 * once during application bootstrap.
 *
 * Registered interactions include:
 * - Sidebar panel navigation buttons (`data-practice-panel`), only active
 *   outside a session.
 * - "Start marked words" button (`data-practice-start-marked`): starts a
 *   session in `"marked"` mode.
 * - "Start" button (`data-practice-start`): starts a full session.
 * - "Begin with fewer" button (`data-practice-begin`): starts with the
 *   partial word list shown in the notice screen.
 * - "Back" / "Exit" button (`data-practice-done`): resets the session and
 *   shows the landing page.
 * - Previous / next card navigation buttons.
 * - Answer buttons (`data-practice-answer`): records the answer and advances
 *   or finishes the session.
 * - Card click / tap to flip.
 * - Practice settings form submission (saves words-per-session via
 *   PATCH `/api/settings`).
 * - Keyboard shortcuts (practice tab, active session only):
 *   - Space / Enter — flip the card.
 *   - `1` / ArrowLeft — answer "don't know".
 *   - `2` / ArrowRight — answer "know".
 *
 * @sideeffects
 * - Adds event listeners on `elements.practiceContent` (delegated clicks and
 *   submit) and `document` (keydown).
 */
export function bindPracticeEvents() {
  elements.practiceContent.addEventListener("click", async (event) => {
    const panelButton = event.target.closest("[data-practice-panel]");
    if (panelButton && !session.active) {
      session.panel = panelButton.dataset.practicePanel;
      renderPracticeLanding(session.panel);
      return;
    }
    if (event.target.closest("[data-practice-start-marked]")) {
      await startSession("marked");
      return;
    }
    if (event.target.closest("[data-practice-start]")) {
      await startSession();
      return;
    }
    if (event.target.closest("[data-practice-begin]")) {
      beginSession(session.words);
      return;
    }
    if (event.target.closest("[data-practice-done]")) {
      resetSession();
      renderPracticeLanding(session.panel);
      return;
    }
    if (event.target.closest("[data-practice-previous]")) {
      previousCard();
      return;
    }
    if (event.target.closest("[data-practice-next]")) {
      nextCard();
      return;
    }
    const answer = event.target.closest("[data-practice-answer]");
    if (answer) {
      await answerCard(answer.dataset.practiceAnswer);
      return;
    }
    if (event.target.closest("[data-practice-card]")) {
      flipCard();
    }
  });

  elements.practiceContent.addEventListener("submit", async (event) => {
    if (event.target.id !== "practiceSettingsForm") {
      return;
    }
    event.preventDefault();
    await savePracticeSettings(event.target);
  });

  document.addEventListener("keydown", async (event) => {
    if (state.activeTab !== "practice" || !session.active) {
      return;
    }
    if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select")) {
      return;
    }
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      flipCard();
      return;
    }
    if (session.flipped && (event.key === "1" || event.key === "ArrowLeft")) {
      event.preventDefault();
      await answerCard("unknown");
    } else if (session.flipped && (event.key === "2" || event.key === "ArrowRight")) {
      event.preventDefault();
      await answerCard("known");
    }
  });
}
