import { requestJson } from "../../api.js";
import { elements } from "../../dom.js";
import { t } from "../../i18n.js";
import { state } from "../../state.js";
import {
  renderPracticeCard,
  renderPracticeEmpty,
  renderPracticeLanding,
  renderPracticeNotice,
  renderPracticeSummary,
  setPracticeStatus
} from "../../views/practice.js";

let loadDashboard = async () => {};

// In-session state lives here rather than in global state because it is only
// meaningful while the practice tab is mid-session.
const session = {
  active: false,
  words: [],
  index: 0,
  flipped: false,
  results: { known: 0, unknown: 0 },
  statusChanged: false
};

export function configurePracticeController(options) {
  loadDashboard = options.loadDashboard;
}

function resetSession() {
  session.active = false;
  session.words = [];
  session.index = 0;
  session.flipped = false;
  session.results = { known: 0, unknown: 0 };
  session.statusChanged = false;
}

// Show the landing page; called when the practice tab is opened.
export function enterPracticeTab() {
  if (session.active) {
    renderPracticeCard(session, session.index, session.flipped);
    return;
  }
  resetSession();
  renderPracticeLanding();
}

async function fetchSession() {
  const params = new URLSearchParams();
  if (state.selectedStudyLanguageId) {
    params.set("languageId", state.selectedStudyLanguageId);
  }
  return requestJson(`/api/practice/session?${params}`);
}

async function startSession() {
  if (!state.selectedStudyLanguageId) {
    return;
  }
  setPracticeStatus(t("practice.loading"));
  let data;
  try {
    data = await fetchSession();
  } catch (error) {
    setPracticeStatus(error.message);
    return;
  }

  if (!data.words.length) {
    resetSession();
    renderPracticeEmpty();
    return;
  }

  if (data.insufficient) {
    resetSession();
    session.words = data.words;
    renderPracticeNotice(data);
    return;
  }

  beginSession(data.words);
}

function beginSession(words) {
  resetSession();
  session.active = true;
  session.words = words;
  renderPracticeCard(session, session.index, session.flipped);
}

function flipCard() {
  if (!session.active || session.flipped) {
    return;
  }
  session.flipped = true;
  renderPracticeCard(session, session.index, session.flipped);
}

async function answerCard(answer) {
  if (!session.active || !session.flipped) {
    return;
  }
  const card = session.words[session.index];
  if (answer === "known") {
    session.results.known += 1;
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
  } else {
    session.results.unknown += 1;
  }

  if (session.index + 1 >= session.words.length) {
    finishSession();
    return;
  }
  session.index += 1;
  session.flipped = false;
  renderPracticeCard(session, session.index, session.flipped);
}

function finishSession() {
  const results = session.results;
  const statusChanged = session.statusChanged;
  resetSession();
  renderPracticeSummary(results);
  if (statusChanged) {
    loadDashboard();
  }
}

export function bindPracticeEvents() {
  elements.practiceContent.addEventListener("click", async (event) => {
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
      renderPracticeLanding();
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

  document.addEventListener("keydown", async (event) => {
    if (state.activeTab !== "practice" || !session.active) {
      return;
    }
    if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select")) {
      return;
    }
    if (!session.flipped && (event.key === " " || event.key === "Enter")) {
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
