import { Fragment, type DragEvent, type MouseEvent } from "react";
import { disambiguationEntries, DisambiguationTable, DisambiguationToggle, hasDisambiguation } from "@/components/app/Disambiguation";
import { TranslationOverride } from "@/components/app/TranslationOverride";
import type { Word, WordStatus } from "@/lib/api/types";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { normalizeStatus, WORD_STATUSES, wordPhonetics } from "./word-list";

/** Clicks on these controls act on the control, not on the row selection. */
const ROW_CONTROL_SELECTOR =
  "[data-translation-override-edit], [data-translation-override-cancel], [data-translation-override-clear], [data-translation-override-form], [data-word-disambiguate], .status-segment";

export interface StatusToggleProps {
  wordId: number;
  status: WordStatus;
  /** Status whose request is in flight for this word; its segment is disabled. */
  pendingStatus?: WordStatus | null;
  onSelect: (status: WordStatus) => void;
}

/** Three-segment unknown/learning/known toggle (.status-toggle); clicking the active segment does nothing. */
export function StatusToggle({ wordId, status, pendingStatus, onSelect }: StatusToggleProps) {
  const t = useT();
  const active = normalizeStatus(status);
  return (
    <div className="status-toggle" role="group" data-word-id={wordId}>
      {WORD_STATUSES.map((value) => {
        const isActive = value === active;
        return (
          <button
            key={value}
            className="status-segment"
            type="button"
            data-status={value}
            data-active={isActive}
            aria-pressed={isActive}
            disabled={pendingStatus === value}
            onClick={() => !isActive && onSelect(value)}
          >
            {t(`word.${value}`)}
          </button>
        );
      })}
    </div>
  );
}

function DragHandleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4 fill-current">
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
            <tr
              className={cn("word-row", selected && "is-selected", draggingId === entry.id && "is-dragging")}
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
              <td className="word-drag-cell px-2 py-3 align-middle" data-label={t("collections.collection")}>
                <span className="word-drag-handle" aria-label={t("collections.dragHandle")} title={t("collections.dragHandle")}>
                  <DragHandleIcon />
                </span>
              </td>
              <td className="px-3 py-3 align-top" data-label={t("table.word")}>
                <div className="word-cell">
                  <span className="word-cell-main">{entry.word}</span>
                  {phonetics ? <span className="word-cell-phonetic">{phonetics}</span> : null}
                  {posKey ? (
                    <span className="word-cell-badges">
                      <span className="word-badge">{t(`pos.${posKey}`, {}, posKey)}</span>
                    </span>
                  ) : null}
                </div>
              </td>
              <td className="px-3 py-3 align-top text-label" data-label={t("table.translation")}>
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
              </td>
              <td className="px-3 py-3 align-middle word-action-cell" data-label={t("reader.disambiguate")}>
                {hasDisambiguation(entry) ? (
                  <DisambiguationToggle expanded={expanded} onToggle={() => onToggleDisambiguation(entry.id)} data-word-disambiguate={entry.id} />
                ) : null}
              </td>
              <td className="status-cell" data-label={t("table.status")}>
                <StatusToggle
                  wordId={entry.id}
                  status={entry.status}
                  pendingStatus={pendingStatus?.wordId === entry.id ? pendingStatus.status : null}
                  onSelect={(status) => onStatus(entry.id, status)}
                />
              </td>
            </tr>
            {expanded && disambiguationEntries(entry).length ? (
              <tr className="disambiguation-row" data-disambiguation-for={entry.id}>
                <td></td>
                <td colSpan={4}>
                  <DisambiguationTable entry={entry} className="disambiguation-table" />
                </td>
              </tr>
            ) : null}
          </Fragment>
        );
      })}
    </>
  );
}
