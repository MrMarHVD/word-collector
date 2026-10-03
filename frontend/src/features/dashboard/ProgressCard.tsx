import { m, useReducedMotion } from "motion/react";
import { Link } from "react-router";
import { Text } from "@/components/ui/text";
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

/** Progress card: a known/learning/unknown pie that fills in on mount, beside the counts. */
export function ProgressCard({ title, titleTo, subtitle, detailText, totalWords, knownWords, learningWords, unknownWords }: ProgressCardProps) {
  const t = useT();
  const formatCount = useFormatCount();
  const { knownPercent, learningPercent } = progressPercents({ totalWords, knownWords, learningWords });
  const reducedMotion = useReducedMotion();
  const pieVars = { "--knownPercent": `${knownPercent}%`, "--learningPercent": `${learningPercent}%` };
  return (
    <article className="grid min-h-28 grid-cols-[74px_1fr] items-center gap-3 rounded-control bg-subtle p-3.5 mobile:min-h-23 mobile:grid-cols-[56px_1fr] mobile:p-3">
      {/* The fill is a CSS-variable animation, which MotionConfig's reduced-motion policy does not cover, so it is skipped explicitly. */}
      <m.div
        className="aspect-square w-18.5 bg-[conic-gradient(var(--status-known)_0_var(--knownPercent),var(--status-learning)_var(--knownPercent)_var(--learningPercent),var(--status-unknown)_var(--learningPercent)_100%)] [mask-image:radial-gradient(circle_farthest-side,transparent_55%,#000_56%,#000_99%,transparent_100%)] mobile:w-14"
        initial={reducedMotion ? false : { "--knownPercent": "0%", "--learningPercent": "0%" }}
        animate={pieVars}
        transition={{ duration: 0.5, ease: MOTION_EASE }}
      />
      <div className="grid gap-0.5 text-caption text-secondary">
        <Text as="strong" variant="body" className="wrap-anywhere font-medium">
          {titleTo ? (
            <Link className="focus-ring rounded-control hover:underline" to={titleTo} data-dashboard-document-link>
              {title}
            </Link>
          ) : (
            title
          )}
        </Text>
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
