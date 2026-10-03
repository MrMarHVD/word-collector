import type { ComponentProps } from "react";
import { ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { disambiguationEntries, type TranslationEntry } from "@/lib/disambiguation";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export { disambiguationEntries, hasDisambiguation, hasTranslationOverride, originalTranslationCandidate } from "@/lib/disambiguation";
export type { DisambiguationEntry, TranslationEntry } from "@/lib/disambiguation";

export interface DisambiguationTableProps {
  entry: TranslationEntry;
  /** Extra classes on the <table>. */
  className?: string;
  /** Pin the header row and drop the table's own scroll container, for a caller that scrolls the table vertically. */
  stickyHeader?: boolean;
}

/**
 * Candidate table (word, translation, part of speech) with the original
 * translation highlighted. Renders nothing when there are no entries. The
 * caller supplies the wrapper (the reader's panel or a vocab row cell).
 */
export function DisambiguationTable({ entry, className, stickyHeader }: DisambiguationTableProps) {
  const t = useT();
  const entries = disambiguationEntries(entry);
  if (!entries.length) {
    return null;
  }
  const headClass = stickyHeader ? "sticky top-0 z-10 bg-panel" : undefined;
  return (
    <Table className={className} container={!stickyHeader}>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className={headClass}>{t("table.word")}</TableHead>
          <TableHead className={headClass}>{t("table.translation")}</TableHead>
          <TableHead className={headClass}>{t("reader.partOfSpeech")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((candidate, index) => (
          <TableRow
            key={`${candidate.source}-${candidate.translation}-${index}`}
            className={cn(candidate.original && "bg-status-known/10 hover:bg-status-known/10")}
            data-original-translation={candidate.original ? "" : undefined}
          >
            <TableCell className="py-1.5 whitespace-normal">{candidate.source || ""}</TableCell>
            <TableCell className="py-1.5 whitespace-normal">{candidate.translation || ""}</TableCell>
            <TableCell className="py-1.5 whitespace-normal">
              {candidate.original ? t("translation.original") : candidate.pos ? t(`pos.${candidate.pos}`, {}, candidate.pos) : ""}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
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
    <Button
      variant="secondary"
      size="sm"
      className={cn("w-max [&[aria-expanded=true]_svg]:rotate-180", className)}
      type="button"
      aria-expanded={expanded}
      onClick={onToggle}
      {...props}
    >
      <ChevronDownIcon className="transition-transform" aria-hidden="true" />
      <span>{t("reader.disambiguate")}</span>
    </Button>
  );
}
