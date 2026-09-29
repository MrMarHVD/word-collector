/**
 * Pure flashcard-session rules, ported from the legacy practice controller
 * and view: flipping, answering, stepping between cards, the results tally
 * and the card text sizing.
 */

import type { PracticeCard } from "@/lib/api";

export type PracticeAnswer = "known" | "unknown";

/** In-session state: the cards, one answer slot per card, the current card and whether it is turned. */
export interface PracticeSessionState {
  active: boolean;
  words: PracticeCard[];
  answers: (PracticeAnswer | null)[];
  index: number;
  flipped: boolean;
  /** Whether a "known" answer changed a word status, so study data must be refreshed at the end. */
  statusChanged: boolean;
}

export interface PracticeResults {
  known: number;
  unknown: number;
}

/** The state outside a session. */
export const IDLE_SESSION: PracticeSessionState = { active: false, words: [], answers: [], index: 0, flipped: false, statusChanged: false };

/** Words per session when the user has no valid setting (legacy `practiceWordsPerSession()`). */
export function practiceWordsPerSession(value: number | null | undefined): number {
  return Number(value) || 20;
}

/** Starts a session on the first card, face up, with every answer open. */
export function beginSession(words: PracticeCard[]): PracticeSessionState {
  return { ...IDLE_SESSION, active: true, words, answers: new Array(words.length).fill(null) };
}

/** Turns the card over, either way, so a turned card can be turned back. */
export function flipCard(session: PracticeSessionState): PracticeSessionState {
  return session.active ? { ...session, flipped: !session.flipped } : session;
}

/** Answers unlock only once the current card is turned. */
export function canAnswer(session: PracticeSessionState): boolean {
  return session.active && session.flipped;
}

/**
 * Records the answer for the current card without moving on. `markKnown` is
 * true when the word must be saved as known: a "known" answer that the card
 * did not already have.
 */
export function recordAnswer(session: PracticeSessionState, answer: PracticeAnswer): { session: PracticeSessionState; markKnown: boolean } {
  const previous = session.answers[session.index];
  const answers = session.answers.slice();
  answers[session.index] = answer;
  return { session: { ...session, answers }, markKnown: answer === "known" && previous !== "known" };
}

/** Whether the current card is the last one, so answering it finishes the session. */
export function isLastCard(session: PracticeSessionState): boolean {
  return session.index + 1 >= session.words.length;
}

/** Moves to the next card, turned when it was already answered. */
export function advanceCard(session: PracticeSessionState): PracticeSessionState {
  const index = session.index + 1;
  return { ...session, index, flipped: Boolean(session.answers[index]) };
}

/** Whether the previous-card arrow is available. */
export function canGoPrevious(session: PracticeSessionState): boolean {
  return session.active && session.index > 0;
}

/** Whether the next-card arrow is available: only past an answered card that is not the last. */
export function canGoNext(session: PracticeSessionState): boolean {
  return session.active && Boolean(session.answers[session.index]) && !isLastCard(session);
}

/** Steps back one card, shown turned. */
export function previousCard(session: PracticeSessionState): PracticeSessionState {
  return canGoPrevious(session) ? { ...session, index: session.index - 1, flipped: true } : session;
}

/** Steps forward one answered card. */
export function nextCard(session: PracticeSessionState): PracticeSessionState {
  return canGoNext(session) ? advanceCard(session) : session;
}

/** Tallies the answers for the results summary. */
export function summarizeAnswers(answers: (PracticeAnswer | null)[]): PracticeResults {
  return answers.reduce<PracticeResults>(
    (totals, answer) => {
      if (answer === "known") totals.known += 1;
      if (answer === "unknown") totals.unknown += 1;
      return totals;
    },
    { known: 0, unknown: 0 }
  );
}

/**
 * Card text size in rem: `maxRem` up to 16 characters, then shrinking with
 * the length. Whitespace counts as 0.45 of a character.
 */
export function cardTextSize(text: string | null | undefined, maxRem = 4.5): number {
  const length = [...String(text || "")].reduce((total, char) => total + (/\s/.test(char) ? 0.45 : 1), 0);
  if (length <= 16) return maxRem;
  if (length <= 40) return Math.max(2.2, maxRem - (length - 16) * 0.08);
  return Math.max(1.15, 2.2 - (length - 40) * 0.018);
}
