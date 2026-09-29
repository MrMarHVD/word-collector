import type { CSSProperties } from "react";
import { useFormatCount, useT } from "@/lib/i18n";
import { progressPercents } from "./progress";

export interface ProgressCardProps {
  title: string;
  subtitle: string;
  /** Localised line under the subtitle (known-of-total or read-of-total). */
  detailText: string;
  totalWords: number;
  knownWords: number;
  learningWords: number;
  unknownWords: number;
}

/** Progress chart card (legacy `.chart-card`): a known/learning/unknown pie beside the counts. */
export function ProgressCard({ title, subtitle, detailText, totalWords, knownWords, learningWords, unknownWords }: ProgressCardProps) {
  const t = useT();
  const formatCount = useFormatCount();
  const { knownPercent, learningPercent } = progressPercents({ totalWords, knownWords, learningWords });
  const pieStyle = { "--knownPercent": `${knownPercent}%`, "--learningPercent": `${learningPercent}%` } as CSSProperties;
  return (
    <article className="chart-card rounded-lg border border-line bg-panel p-3.5">
      <div className="pie" style={pieStyle} />
      <div>
        <strong>{title}</strong>
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
