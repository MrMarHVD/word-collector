import { describe, expect, it } from "vitest";
import type { PracticeCard } from "@/lib/api";
import {
  advanceCard,
  beginSession,
  canAnswer,
  canGoNext,
  canGoPrevious,
  cardTextSize,
  flipCard,
  IDLE_SESSION,
  isLastCard,
  nextCard,
  practiceWordsPerSession,
  previousCard,
  recordAnswer,
  summarizeAnswers,
  type PracticeSessionState
} from "./practice-session";

const card = (wordId: number): PracticeCard => ({ wordId, word: `w${wordId}`, translation: `t${wordId}`, reading: "", pinyin: "", clickCount: 1 });
const WORDS = [card(1), card(2), card(3)];

describe("practice session", () => {
  it("begins on the first card, face up, with open answers", () => {
    const session = beginSession(WORDS);
    expect(session).toMatchObject({ active: true, index: 0, flipped: false, statusChanged: false, answers: [null, null, null] });
    expect(canAnswer(session)).toBe(false);
  });

  it("flips both ways, and not outside a session", () => {
    const flipped = flipCard(beginSession(WORDS));
    expect(flipped.flipped).toBe(true);
    expect(canAnswer(flipped)).toBe(true);
    expect(flipCard(flipped).flipped).toBe(false);
    expect(flipCard(IDLE_SESSION)).toBe(IDLE_SESSION);
  });

  it("marks a word known only on a new known answer", () => {
    const session = flipCard(beginSession(WORDS));
    const known = recordAnswer(session, "known");
    expect(known.markKnown).toBe(true);
    expect(known.session.answers).toEqual(["known", null, null]);
    expect(session.answers).toEqual([null, null, null]);
    expect(recordAnswer(known.session, "known").markKnown).toBe(false);
    expect(recordAnswer(session, "unknown").markKnown).toBe(false);
  });

  it("advances turned only onto answered cards", () => {
    const answered = recordAnswer(flipCard(beginSession(WORDS)), "known").session;
    const second = advanceCard(answered);
    expect(second).toMatchObject({ index: 1, flipped: false });
    const back = previousCard(second);
    expect(back).toMatchObject({ index: 0, flipped: true });
    expect(advanceCard({ ...back, answers: ["known", "unknown", null] })).toMatchObject({ index: 1, flipped: true });
  });

  it("allows previous after the first card and next only past an answered, non-last card", () => {
    const first = beginSession(WORDS);
    expect(canGoPrevious(first)).toBe(false);
    expect(previousCard(first)).toBe(first);
    expect(canGoNext(first)).toBe(false);
    expect(nextCard(first)).toBe(first);
    expect(canGoNext({ ...first, answers: ["known", null, null] })).toBe(true);
    const last: PracticeSessionState = { ...first, index: 2, answers: ["known", "unknown", "known"] };
    expect(isLastCard(last)).toBe(true);
    expect(canGoNext(last)).toBe(false);
    expect(canGoPrevious(last)).toBe(true);
  });

  it("tallies known and unknown answers", () => {
    expect(summarizeAnswers(["known", "unknown", "unknown", null])).toEqual({ known: 1, unknown: 2 });
  });

  it("defaults words per session to 20", () => {
    expect(practiceWordsPerSession(5)).toBe(5);
    expect(practiceWordsPerSession(0)).toBe(20);
    expect(practiceWordsPerSession(undefined)).toBe(20);
  });
});

describe("cardTextSize", () => {
  it("keeps short text at the maximum size", () => {
    expect(cardTextSize("short", 4.5)).toBe(4.5);
    expect(cardTextSize("", 4.1)).toBe(4.1);
  });

  it("shrinks medium text linearly, not below 2.2rem", () => {
    expect(cardTextSize("a".repeat(26), 4.5)).toBeCloseTo(3.7);
    expect(cardTextSize("a".repeat(40), 4.1)).toBeCloseTo(2.2);
  });

  it("counts whitespace as less than a character", () => {
    expect(cardTextSize("a ".repeat(11), 4.5)).toBe(4.5);
  });

  it("shrinks long text, not below 1.15rem", () => {
    expect(cardTextSize("a".repeat(50))).toBeCloseTo(2.02);
    expect(cardTextSize("a".repeat(500))).toBe(1.15);
  });
});
