import { useEffect, useLayoutEffect } from "react";
import { flipCard } from "./practice-session";
import { usePracticeStore } from "./practice-store";
import { PracticeEmpty, PracticeLanding, PracticeNotice, PracticeSettings, PracticeShell, PracticeSummary } from "./PracticePanels";
import { PracticeSessionView } from "./PracticeSessionView";
import { useAnswerCard, usePracticeOwner } from "./use-practice";
import "./practice.css";

/**
 * Flashcard practice (#practiceView). A session in progress resumes at its
 * card when the tab is reopened; anything else returns to the landing page.
 * While a session runs, Space/Enter flip the card, 1/ArrowLeft answer
 * "don't know" and 2/ArrowRight answer "know".
 */
export default function PracticePage() {
  const view = usePracticeStore((state) => state.view);
  const panel = usePracticeStore((state) => state.panel);
  const owner = usePracticeOwner();
  const answer = useAnswerCard();

  // Before paint, so a finished screen from an earlier visit never flashes.
  useLayoutEffect(() => {
    const store = usePracticeStore.getState();
    if (!store.session.active || store.owner !== owner) {
      store.showLanding();
    }
  }, [owner]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const { session, updateSession } = usePracticeStore.getState();
      if (!session.active) {
        return;
      }
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select")) {
        return;
      }
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        updateSession(flipCard);
        return;
      }
      if (session.flipped && (event.key === "1" || event.key === "ArrowLeft")) {
        event.preventDefault();
        void answer("unknown");
      } else if (session.flipped && (event.key === "2" || event.key === "ArrowRight")) {
        event.preventDefault();
        void answer("known");
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [answer]);

  return (
    <section id="practiceView">
      <div id="practiceContent" className="practice-content">
        {view === "session" ? <PracticeSessionView /> : null}
        {view === "summary" ? <PracticeSummary /> : null}
        {view === "landing" || view === "empty" || view === "notice" ? (
          <PracticeShell>
            {view === "empty" ? <PracticeEmpty /> : null}
            {view === "notice" ? <PracticeNotice /> : null}
            {view === "landing" ? panel === "settings" ? <PracticeSettings /> : <PracticeLanding /> : null}
          </PracticeShell>
        ) : null}
      </div>
    </section>
  );
}
