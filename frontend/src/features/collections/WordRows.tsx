import { Fragment, type DragEvent, type MouseEvent } from "react";
import { disambiguationEntries, DisambiguationTable, DisambiguationToggle, hasDisambiguation } from "@/components/app/Disambiguation";
import { Segmented } from "@/components/app/Segmented";
import { TranslationOverride } from "@/components/app/TranslationOverride";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { Text } from "@/components/ui/text";
import type { Word, WordStatus } from "@/lib/api/types";
import { useIsMobileLayout } from "@/lib/hooks/use-media-query";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { normalizeStatus, WORD_STATUSES, wordPhonetics } from "./word-list";

/** Clicks on these controls act on the control, not on the row selection. */
const ROW_CONTROL_SELECTOR =
  "[data-translation-override-edit], [data-translation-override-cancel], [data-translation-override-clear], [data-translation-override-form], [data-word-disambiguate], .status-toggle";

export interface StatusToggleProps {
  wordId: number;
  status: WordStatus;
  /** Status whose request is in flight for this word; its segment is disabled. */
  pendingStatus?: WordStatus | null;
  onSelect: (status: WordStatus) => void;
}

/** Three-segment unknown/learning/known toggle (`.status-toggle` is the selector hook for specs and row-click guards); clicking the active segment does nothing. */
export function StatusToggle({ wordId, status, pendingStatus, onSelect }: StatusToggleProps) {
  const t = useT();
  const isMobile = useIsMobileLayout();
  return (
    <Segmented
      className="status-toggle max-w-[210px]"
      aria-label={t("table.status")}
      size={isMobile ? "md" : "sm"}
      value={normalizeStatus(status)}
      onValueChange={onSelect}
      options={WORD_STATUSES.map((value) => ({
        value,
        label: t(`word.${value}`),
        itemProps: { "data-status": value, disabled: pendingStatus === value }
      }))}
      data-word-id={wordId}
    />
  );
}

function DragHandleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4 fill-current">
      <circle cx="5" cy="3" r="1.4" />
      <circle cx="11" cy="3" r="1.4" />
      <circle cx="5" cy="8" r="1.4" />
      <circle cx="11" cy="8" r="1.4" />
      <circle cx="5" cy="13" r="1.4" />
      <circle cx="11" cy="13" r="1.4" />
    </svg>
  );
}

export interface WordRowsProps {
  words: Word[];
  selectedIds: Set<number>;
  expandedDisambiguationId: number | null;
  editingTranslationId: number | null;
  pendingStatus: { wordId: number; status: WordStatus } | null;
  draggingId: number | null;
  onSelectRow: (event: MouseEvent, wordId: number) => void;
  onStatus: (wordId: number, status: WordStatus) => void;
  onToggleDisambiguation: (wordId: number) => void;
  onEditTranslation: (wordId: number | null) => void;
  onSaveTranslation: (wordId: number, value: string | null) => Promise<void>;
  onDragStart: (event: DragEvent<HTMLTableRowElement>, wordId: number) => void;
  onDragEnd: () => void;
}

/**
 * The vocab table rows (#wordRows content, ported from views/words.js): drag
 * handle, word with phonetics and part-of-speech badges, translation
 * override, disambiguation toggle and status toggle, plus the expanded
 * disambiguation row under the row it belongs to.
 */
export function WordRows({
  words,
  selectedIds,
  expandedDisambiguationId,
  editingTranslationId,
  pendingStatus,
  draggingId,
  onSelectRow,
  onStatus,
  onToggleDisambiguation,
  onEditTranslation,
  onSaveTranslation,
  onDragStart,
  onDragEnd
}: WordRowsProps) {
  const t = useT();
  return (
    <>
      {words.map((entry) => {
        const selected = selectedIds.has(entry.id);
        const expanded = expandedDisambiguationId === entry.id;
        const posKey = entry.posSubcategory || entry.pos;
        const phonetics = wordPhonetics(entry);
        return (
          <Fragment key={entry.id}>
            <TableRow
              className={cn("word-row group/row cursor-default mobile:block", draggingId === entry.id && "opacity-50")}
              data-state={selected ? "selected" : undefined}
              draggable
              data-word-id={entry.id}
              data-collection-id={entry.collectionId}
              aria-selected={selected}
              onClick={(event) => {
                if (!(event.target as Element).closest(ROW_CONTROL_SELECTOR)) {
                  onSelectRow(event, entry.id);
                }
              }}
              onDragStart={(event) => onDragStart(event, entry.id)}
              onDragEnd={onDragEnd}
            >
              <TableCell className="word-drag-cell w-7 cursor-grab px-2 text-secondary select-none active:cursor-grabbing mobile:hidden">
                <span
                  className="word-drag-handle inline-flex items-center justify-center rounded-control p-1 group-hover/row:text-label"
                  aria-label={t("collections.dragHandle")}
                  title={t("collections.dragHandle")}
                >
                  <DragHandleIcon />
                </span>
              </TableCell>
              <TableCell className="min-w-56 whitespace-normal mobile:block mobile:min-w-0 mobile:w-full mobile:px-3.5 mobile:pt-3.5 mobile:pb-0.5">
                <div className="word-cell flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mobile:grid mobile:gap-0.5">
                  <Text as="span" className="word-cell-main font-semibold mobile:text-heading">
                    {entry.word}
                  </Text>
                  {phonetics ? (
                    <Text as="span" variant="caption" tone="muted" className="word-cell-phonetic">
                      {phonetics}
                    </Text>
                  ) : null}
                  {posKey ? (
                    <span className="word-cell-badges flex flex-wrap gap-1 self-center mobile:hidden">
                      <Badge>{t(`pos.${posKey}`, {}, posKey)}</Badge>
                    </span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="min-w-44 whitespace-normal text-label mobile:block mobile:min-w-0 mobile:w-full mobile:px-3.5 mobile:pb-3 mobile:[overflow-wrap:anywhere]">
                <TranslationOverride
                  entry={entry}
                  wordId={entry.id}
                  context="vocab"
                  editing={editingTranslationId === entry.id}
                  onEdit={() => onEditTranslation(entry.id)}
                  onCancel={() => onEditTranslation(null)}
                  onSave={(value) => onSaveTranslation(entry.id, value)}
                  onClear={() => onSaveTranslation(entry.id, null)}
                />
              </TableCell>
              <TableCell className="word-action-cell mobile:hidden">
                {hasDisambiguation(entry) ? (
                  <DisambiguationToggle expanded={expanded} onToggle={() => onToggleDisambiguation(entry.id)} data-word-disambiguate={entry.id} />
                ) : null}
              </TableCell>
              <TableCell className="status-cell w-[300px] mobile:block mobile:w-full mobile:px-3.5 mobile:pb-3.5">
                <StatusToggle
                  wordId={entry.id}
                  status={entry.status}
                  pendingStatus={pendingStatus?.wordId === entry.id ? pendingStatus.status : null}
                  onSelect={(status) => onStatus(entry.id, status)}
                />
              </TableCell>
            </TableRow>
            {expanded && disambiguationEntries(entry).length ? (
              <TableRow className="bg-subtle hover:bg-subtle mobile:hidden" data-disambiguation-for={entry.id}>
                <TableCell></TableCell>
                <TableCell colSpan={4} className="whitespace-normal">
                  <DisambiguationTable entry={entry} />
                </TableCell>
              </TableRow>
            ) : null}
          </Fragment>
        );
      })}
    </>
  );
}
