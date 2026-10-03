import type { CSSProperties } from "react";
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import { m, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IconButton } from "@/components/ui/icon-button";
import { Text } from "@/components/ui/text";
import { useFormatCount, useT } from "@/lib/i18n";
import { MOTION_FADE } from "@/lib/motion";
import { canGoNext, canGoPrevious, cardTextSize, flipCard, nextCard, previousCard } from "./practice-session";
import { usePracticeStore } from "./practice-store";
import { useAnswerCard } from "./use-practice";

const FACE_CLASS = "practice-card-face absolute inset-0 grid place-content-center place-items-center gap-4 text-center";

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
        <Button variant="secondary" data-practice-done onClick={() => showLanding()}>
          {t("practice.exit")}
        </Button>
        <Text variant="caption" tone="muted" className="practice-progress" role="status">
          {t("practice.progress", { current: formatCount(session.index + 1), total: formatCount(session.words.length) })}
        </Text>
      </div>
      <div className="practice-card-stage">
        <IconButton
          variant="secondary"
          className="practice-card-side-button practice-card-side-button-prev"
          data-practice-previous
          aria-label={t("practice.previous")}
          title={t("practice.previous")}
          disabled={!canGoPrevious(session)}
          onClick={() => updateSession(previousCard)}
        >
          <ArrowLeftIcon />
        </IconButton>
        <div className="practice-card-wrap">
          {/* Keyed by card so moving on never animates the next card's back face into view. */}
          <m.div
            key={session.index}
            className={`practice-card focus-ring rounded-container${session.flipped ? " is-flipped" : ""}${reducedMotion ? " is-crossfade" : ""}`}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0, rotateY: session.flipped && !reducedMotion ? 180 : 0 }}
            transition={MOTION_FADE}
            data-practice-card
            tabIndex={0}
            role="button"
            aria-label={t("practice.flipHint")}
            onClick={() => updateSession(flipCard)}
          >
            <Card className={`${FACE_CLASS} practice-card-front`}>
              <span className="practice-card-word" style={cardTextStyle(card.word, 4.5)}>
                {card.word}
              </span>
              <Text variant="caption" tone="muted" className="practice-card-hint">
                {t("practice.flipHint")}
              </Text>
            </Card>
            <Card className={`${FACE_CLASS} practice-card-back`}>
              <span className="practice-card-translation" style={cardTextStyle(translation, 4.1)}>
                {translation}
              </span>
              {phonetic ? (
                <Text variant="body" tone="muted" className="practice-card-phonetic">
                  {phonetic}
                </Text>
              ) : null}
            </Card>
          </m.div>
        </div>
        <IconButton
          variant="secondary"
          className="practice-card-side-button practice-card-side-button-next"
          data-practice-next
          aria-label={t("practice.next")}
          title={t("practice.next")}
          disabled={!canGoNext(session)}
          onClick={() => updateSession(nextCard)}
        >
          <ArrowRightIcon />
        </IconButton>
      </div>
      <div className="practice-answer mt-6 grid grid-cols-2 gap-3">
        <Button
          variant="secondary"
          size="lg"
          className="border-status-unknown/50 text-(--status-unknown-text)"
          data-practice-answer="unknown"
          disabled={!session.flipped}
          onClick={() => void answer("unknown")}
        >
          {t("practice.dontKnow")}
        </Button>
        <Button
          variant="secondary"
          size="lg"
          className="border-status-known/50 text-(--status-known-text)"
          data-practice-answer="known"
          disabled={!session.flipped}
          onClick={() => void answer("known")}
        >
          {t("practice.know")}
        </Button>
      </div>
    </section>
  );
}
