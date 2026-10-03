import { m, useReducedMotion } from "motion/react";
import { Link } from "react-router";
import { useFormatCount, useT } from "@/lib/i18n";
import { MOTION_EASE } from "@/lib/motion";
import { progressPercents } from "./progress";

export interface ProgressCardProps {
  title: string;
  /** When set, the title is a link to this path (e.g. the Library "go to" address). */
  titleTo?: string;
  subtitle: string;
  /** Localised line under the subtitle (known-of-total or read-of-total). */
  detailText: string;
  totalWords: number;
  knownWords: number;
  learningWords: number;
  unknownWords: number;
}

/** Progress chart card (legacy `.chart-card`): a known/learning/unknown pie that fills in on mount, beside the counts. */
export function ProgressCard({ title, titleTo, subtitle, detailText, totalWords, knownWords, learningWords, unknownWords }: ProgressCardProps) {
  const t = useT();
  const formatCount = useFormatCount();
  const { knownPercent, learningPercent } = progressPercents({ totalWords, knownWords, learningWords });
  const reducedMotion = useReducedMotion();
  const pieVars = { "--knownPercent": `${knownPercent}%`, "--learningPercent": `${learningPercent}%` };
  return (
    <article className="chart-card rounded-lg border border-line bg-panel p-3.5">
      {/* The fill is a CSS-variable animation, which MotionConfig's reduced-motion policy does not cover, so it is skipped explicitly. */}
      <m.div
        className="pie"
        initial={reducedMotion ? false : { "--knownPercent": "0%", "--learningPercent": "0%" }}
        animate={pieVars}
        transition={{ duration: 0.5, ease: MOTION_EASE }}
      />
      <div>
        <strong>
          {titleTo ? (
            <Link className="chart-card-link" to={titleTo}>
              {title}
            </Link>
          ) : (
            title
          )}
        </strong>
        <span>{subtitle}</span>
        <span>{detailText}</span>
        <span>
          {t("progress.statusBreakdown", { known: formatCount(knownWords), learning: formatCount(learningWords), unknown: formatCount(unknownWords) })}
        </span>
        <span>{t("progress.complete", { percent: knownPercent })}</span>
      </div>
    </article>
  );
}
