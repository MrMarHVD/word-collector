/**
 * Feature-local UI state for practice. It lives outside the page, like the
 * legacy controller's module state, so a session in progress resumes at the
 * same card when the user leaves the tab and comes back.
 */

import { create } from "zustand";
import type { PracticeCard, PracticeSession } from "@/lib/api";
import { IDLE_SESSION, beginSession, summarizeAnswers, type PracticeResults, type PracticeSessionState } from "./practice-session";

export type PracticePanel = "practice" | "settings";
export type PracticeView = "landing" | "empty" | "notice" | "session" | "summary";

interface PracticeState {
  view: PracticeView;
  /** Sidebar panel of the landing screen; kept across sessions. */
  panel: PracticePanel;
  session: PracticeSessionState;
  /** Owner of the session, so it only resumes for the same user and study language. */
  owner: string | null;
  /** The short session offered by the "fewer words" notice. */
  notice: PracticeSession | null;
  results: PracticeResults | null;
  /** Text of the landing page's #practiceStatus. */
  status: string;
  /** Leaves any session and shows the landing screen on `panel` (default: the current one). */
  showLanding: (panel?: PracticePanel) => void;
  showEmpty: () => void;
  showNotice: (notice: PracticeSession) => void;
  begin: (words: PracticeCard[], owner: string) => void;
  updateSession: (update: (session: PracticeSessionState) => PracticeSessionState) => void;
  /** Ends the session and shows its results. */
  finish: () => void;
  setStatus: (status: string) => void;
}

const LEFT_SESSION = { session: IDLE_SESSION, owner: null, notice: null, results: null, status: "" };

/** Practice screen and session state. */
export const usePracticeStore = create<PracticeState>((set, get) => ({
  view: "landing",
  panel: "practice",
  ...LEFT_SESSION,
  showLanding: (panel = get().panel) => set({ ...LEFT_SESSION, view: "landing", panel }),
  showEmpty: () => set({ ...LEFT_SESSION, view: "empty" }),
  showNotice: (notice) => set({ ...LEFT_SESSION, view: "notice", notice }),
  begin: (words, owner) => set({ ...LEFT_SESSION, view: "session", session: beginSession(words), owner }),
  updateSession: (update) => set((state) => ({ session: update(state.session) })),
  finish: () => set((state) => ({ ...LEFT_SESSION, view: "summary", results: summarizeAnswers(state.session.answers) })),
  setStatus: (status) => set({ status })
}));
