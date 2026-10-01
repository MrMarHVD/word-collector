import type { CSSProperties } from "react";
import { m, useReducedMotion } from "motion/react";
import { useFormatCount, useT } from "@/lib/i18n";
import { MOTION_FADE } from "@/lib/motion";
import { canGoNext, canGoPrevious, cardTextSize, flipCard, nextCard, previousCard } from "./practice-session";
import { usePracticeStore } from "./practice-store";
import { useAnswerCard } from "./use-practice";

const SIDE_BUTTON_CLASS =
  "practice-card-side-button practice-secondary-button rounded-md border border-line bg-panel text-brand hover:bg-hover disabled:opacity-40 disabled:cursor-not-allowed";
const ANSWER_BUTTON_CLASS = "practice-answer-button min-h-12 rounded-md border text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed";

/** Inline style that sizes card text to its length. */
function cardTextStyle(text: string, maxRem: number): CSSProperties {
  return { "--practice-card-text-size": `${cardTextSize(text, maxRem).toFixed(2)}rem` } as CSSProperties;
}

/**
 * The flashcard screen: exit and progress, the card between the arrows, and the answer buttons.
 * Each card fades in as it is shown (no exit animation, so a single [data-practice-card] ever
 * exists) and flips in 3D; under reduced motion the flip is a crossfade of the two faces.
 */
export function PracticeSessionView() {
  const t = useT();
  const formatCount = useFormatCount();
  const session = usePracticeStore((state) => state.session);
  const updateSession = usePracticeStore((state) => state.updateSession);
  const showLanding = usePracticeStore((state) => state.showLanding);
  const answer = useAnswerCard();
  const reducedMotion = useReducedMotion();
  const card = session.words[session.index];
  if (!card) {
    return null;
  }
  const phonetic = card.reading || card.pinyin || "";
  const translation = card.translation || t("practice.noTranslation");
  return (
    <section className="practice-session">
      <div className="practice-session-head mb-4 flex items-center justify-between gap-3">
        <button
          className="practice-secondary-button min-h-10 rounded-md border border-line bg-panel px-4 text-sm font-bold text-brand hover:bg-hover"
          type="button"
          data-practice-done
          onClick={() => showLanding()}
        >
          {t("practice.exit")}
        </button>
        <span className="practice-progress text-sm font-semibold text-secondary" role="status">
          {t("practice.progress", { current: formatCount(session.index + 1), total: formatCount(session.words.length) })}
        </span>
      </div>
      <div className="practice-card-stage">
        <button
          className={`${SIDE_BUTTON_CLASS} practice-card-side-button-prev`}
          type="button"
          data-practice-previous
          aria-label={t("practice.previous")}
          title={t("practice.previous")}
          disabled={!canGoPrevious(session)}
          onClick={() => updateSession(previousCard)}
        >
          <span aria-hidden="true">←</span>
        </button>
        <div className="practice-card-wrap">
          {/* Keyed by card so moving on never animates the next card's back face into view. */}
          <m.div
            key={session.index}
            className={`practice-card${session.flipped ? " is-flipped" : ""}${reducedMotion ? " is-crossfade" : ""}`}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0, rotateY: session.flipped && !reducedMotion ? 180 : 0 }}
            transition={MOTION_FADE}
            data-practice-card
            tabIndex={0}
            role="button"
            aria-label={t("practice.flipHint")}
            onClick={() => updateSession(flipCard)}
          >
            <div className="practice-card-face practice-card-front">
              <span className="practice-card-word" style={cardTextStyle(card.word, 4.5)}>
                {card.word}
              </span>
              <span className="practice-card-hint">{t("practice.flipHint")}</span>
            </div>
            <div className="practice-card-face practice-card-back">
              <span className="practice-card-translation" style={cardTextStyle(translation, 4.1)}>
                {translation}
              </span>
              {phonetic ? <span className="practice-card-phonetic">{phonetic}</span> : null}
            </div>
          </m.div>
        </div>
        <button
          className={`${SIDE_BUTTON_CLASS} practice-card-side-button-next`}
          type="button"
          data-practice-next
          aria-label={t("practice.next")}
          title={t("practice.next")}
          disabled={!canGoNext(session)}
          onClick={() => updateSession(nextCard)}
        >
          <span aria-hidden="true">→</span>
        </button>
      </div>
      <div className="practice-answer mt-6 grid grid-cols-2 gap-3">
        <button
          className={`${ANSWER_BUTTON_CLASS} is-unknown`}
          type="button"
          data-practice-answer="unknown"
          disabled={!session.flipped}
          onClick={() => void answer("unknown")}
        >
          {t("practice.dontKnow")}
        </button>
        <button
          className={`${ANSWER_BUTTON_CLASS} is-known`}
          type="button"
          data-practice-answer="known"
          disabled={!session.flipped}
          onClick={() => void answer("known")}
        >
          {t("practice.know")}
        </button>
      </div>
    </section>
  );
}
