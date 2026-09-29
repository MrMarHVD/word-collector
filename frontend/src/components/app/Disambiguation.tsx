import type { ComponentProps } from "react";
import { disambiguationEntries, type TranslationEntry } from "@/lib/disambiguation";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export { disambiguationEntries, hasDisambiguation, hasTranslationOverride, originalTranslationCandidate } from "@/lib/disambiguation";
export type { DisambiguationEntry, TranslationEntry } from "@/lib/disambiguation";

export interface DisambiguationTableProps {
  entry: TranslationEntry;
  /** Class on the <table> ("disambiguation-table" in the vocab row; none inside the reader's .disambiguation-panel). */
  className?: string;
}

/**
 * Candidate table (word, translation, part of speech) with the original
 * translation highlighted. Renders nothing when there are no entries. The
 * caller supplies the wrapper: `.disambiguation-panel` (reader) or a
 * `.disambiguation-row` cell (vocab).
 */
export function DisambiguationTable({ entry, className }: DisambiguationTableProps) {
  const t = useT();
  const entries = disambiguationEntries(entry);
  if (!entries.length) {
    return null;
  }
  return (
    <table className={className}>
      <thead>
        <tr>
          <th>{t("table.word")}</th>
          <th>{t("table.translation")}</th>
          <th>{t("reader.partOfSpeech")}</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((candidate, index) => (
          <tr key={`${candidate.source}-${candidate.translation}-${index}`} className={candidate.original ? "is-original-translation" : undefined}>
            <td>{candidate.source || ""}</td>
            <td>{candidate.translation || ""}</td>
            <td>{candidate.original ? t("translation.original") : candidate.pos ? t(`pos.${candidate.pos}`, {}, candidate.pos) : ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export interface DisambiguationToggleProps extends Omit<ComponentProps<"button">, "children" | "type"> {
  expanded: boolean;
  onToggle: () => void;
}

/** The "Disambiguate ▾" button that expands the candidate table; extra props (data-* hooks) pass through. */
export function DisambiguationToggle({ expanded, onToggle, className, ...props }: DisambiguationToggleProps) {
  const t = useT();
  return (
    <button
      className={cn(
        "disambiguation-button secondary-button rounded-md border border-line bg-panel px-3 text-sm font-bold text-brand hover:bg-hover",
        className
      )}
      type="button"
      aria-expanded={expanded}
      onClick={onToggle}
      {...props}
    >
      <span className="disambiguation-button-icon" aria-hidden="true">
        ▾
      </span>
      <span>{t("reader.disambiguate")}</span>
    </button>
  );
}
