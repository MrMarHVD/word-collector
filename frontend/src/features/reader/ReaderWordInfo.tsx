import { useLayoutEffect, useState, type ReactNode, type RefObject } from "react";
import { m } from "motion/react";
import { CloseButton } from "@/components/app/CloseButton";
import { DisambiguationTable, DisambiguationToggle, hasDisambiguation } from "@/components/app/Disambiguation";
import { TranslationOverride } from "@/components/app/TranslationOverride";
import { SheetTitle } from "@/components/ui/sheet";
import type { ReaderToken, WordStatus } from "@/lib/api/types";
import { useExitHold } from "@/lib/hooks/use-exit-hold";
import { useT } from "@/lib/i18n";
import { MOTION_FADE, MOTION_FADE_FAST } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { wordInfoPosition } from "./reader-popup-position";
import { normalizeStatus } from "./reader-tokens";
import { ReaderSheet } from "./ReaderSheet";

const WORD_STATUSES: WordStatus[] = ["unknown", "learning", "known"];

/** Base classes of #readerWordInfo (legacy index.html); reader.css turns it into a bottom sheet on mobile. */
const WORD_INFO_CLASS =
  "reader-word-info fixed z-10 max-h-[min(420px,calc(100vh-24px))] min-w-60 max-w-[min(340px,calc(100vw-24px))] overflow-auto rounded-lg border border-line bg-panel p-3.5 shadow-panel";

export interface ReaderWordInfoProps {
  /** The word shown, or null when closed. */
  token: ReaderToken | null;
  /** Element to measure for the word's on-screen position (the token's button is looked up inside it). */
  readerTextRef: RefObject<HTMLElement | null>;
  /** Receives the popup element, so outside clicks can be detected. */
  popupRef: RefObject<HTMLElement | null>;
  isMobile: boolean;
  /** Mobile focus mode keeps room for the fixed page controls below the sheet. */
  mobileFocus: boolean;
  /** Whether the translation override is being edited. */
  editing: boolean;
  onEditOverride: () => void;
  onCancelOverride: () => void;
  onSaveOverride: (value: string | null) => Promise<void>;
  onClose: () => void;
  onStatusChange: (wordId: number, status: WordStatus) => Promise<void>;
  onPracticeChange: (wordId: number, wantToPractice: boolean) => Promise<void>;
}

interface WordInfoBodyProps extends Omit<ReaderWordInfoProps, "token" | "readerTextRef" | "popupRef" | "isMobile" | "mobileFocus"> {
  token: ReaderToken;
  /** Renders the headword; the mobile sheet uses it as the dialog title. */
  renderTitle: (surface: string) => ReactNode;
}

/** The three-segment status control (legacy renderStatusToggle), with the word id under data-reader-word-id. */
function StatusToggle({ wordId, status, onSelect }: { wordId: number; status: WordStatus; onSelect: (status: WordStatus) => Promise<void> }) {
  const t = useT();
  const [pendingStatus, setPendingStatus] = useState<WordStatus | null>(null);

  async function select(next: WordStatus) {
    if (next === status) {
      return;
    }
    setPendingStatus(next);
    try {
      await onSelect(next);
    } finally {
      setPendingStatus(null);
    }
  }

  return (
    <div className="status-toggle" role="group" data-reader-word-id={wordId}>
      {WORD_STATUSES.map((value) => (
        <button
          key={value}
          className="status-segment"
          type="button"
          data-status={value}
          data-active={value === status}
          aria-pressed={value === status}
          disabled={pendingStatus === value}
          onClick={() => void select(value)}
        >
          {t(`word.${value}`)}
        </button>
      ))}
    </div>
  );
}

/** The popup's content: headword, details, translation override, practice mark, status and disambiguation. */
function WordInfoBody({
  token,
  renderTitle,
  editing,
  onEditOverride,
  onCancelOverride,
  onSaveOverride,
  onClose,
  onStatusChange,
  onPracticeChange
}: WordInfoBodyProps) {
  const t = useT();
  const [disambiguationOpen, setDisambiguationOpen] = useState(false);
  const [pendingPractice, setPendingPractice] = useState<boolean | null>(null);
  const status = normalizeStatus(token.status);
  const dictionaryForm = token.dictionaryForm || token.lemma;
  const subcategoryLabel = token.posSubcategory ? t(`pos.${token.posSubcategory}`, {}, token.posSubcategory) : "";
  const posKey = token.posSubcategory || token.wordPos;
  const posLabel = posKey ? t(`pos.${posKey}`, {}, posKey) : "";
  const conjugationLabel = token.conjugationForm ? t(`conjugation.${token.conjugationForm}`, {}, token.conjugationForm) : "";
  const posLabelParts = [posLabel, conjugationLabel].filter(Boolean);
  // The practice mark can only be set while the word is learning. Outside that
  // status the checkbox is disabled and forced off.
  const canPractice = status === "learning";
  const practiceChecked = pendingPractice ?? (canPractice && Boolean(token.wantToPractice));
  const showDisambiguation = hasDisambiguation(token);

  const rows: { label: string; value: ReactNode }[] = [
    { label: t("reader.dictionaryForm"), value: `${dictionaryForm}${subcategoryLabel ? ` (${subcategoryLabel})` : ""}` },
    {
      label: t("table.translation"),
      value: (
        <TranslationOverride
          entry={token}
          wordId={token.wordId}
          context="reader"
          compact
          editing={editing}
          onEdit={onEditOverride}
          onCancel={onCancelOverride}
          onSave={(value) => onSaveOverride(value)}
          onClear={() => onSaveOverride(null)}
        />
      )
    }
  ];
  if (token.reading && token.reading !== dictionaryForm) {
    rows.push({ label: t("reader.reading"), value: token.reading });
  }
  if (token.pinyin) {
    rows.push({ label: t("reader.pinyin"), value: token.pinyin });
  }
  if (token.traditional && token.traditional !== dictionaryForm) {
    rows.push({ label: t("reader.traditional"), value: token.traditional });
  }
  if (posLabelParts.length) {
    rows.push({ label: t("reader.partOfSpeech"), value: posLabelParts.join(" · ") });
  }
  rows.push({ label: t("table.status"), value: t(`word.${status}`) });

  async function togglePractice(wantToPractice: boolean) {
    setPendingPractice(wantToPractice);
    try {
      await onPracticeChange(token.wordId, wantToPractice);
    } finally {
      // On failure the token is unchanged, so the box returns to what persisted.
      setPendingPractice(null);
    }
  }

  return (
    <>
      <div className="reader-word-info-head">
        {renderTitle(token.surface)}
        {showDisambiguation ? (
          <DisambiguationToggle expanded={disambiguationOpen} onToggle={() => setDisambiguationOpen((open) => !open)} data-disambiguate />
        ) : null}
        <CloseButton label={t("reader.closeTranslation")} data-reader-word-info-close onClick={onClose} />
      </div>
      <dl>
        {rows.map((row) => (
          <FragmentRow key={row.label} label={row.label} value={row.value} />
        ))}
      </dl>
      <label className={cn("reader-practice-toggle", !canPractice && "is-disabled")} title={canPractice ? undefined : t("reader.practiceHint")}>
        <input
          className="reader-checkbox"
          type="checkbox"
          data-reader-practice-checkbox
          data-reader-word-id={token.wordId}
          checked={practiceChecked}
          disabled={!canPractice || pendingPractice !== null}
          onChange={(event) => void togglePractice(event.target.checked)}
        />
        <span>{t("reader.practice")}</span>
      </label>
      <StatusToggle wordId={token.wordId} status={status} onSelect={(next) => onStatusChange(token.wordId, next)} />
      {showDisambiguation ? (
        <div className="disambiguation-panel" data-disambiguation-panel hidden={!disambiguationOpen}>
          <DisambiguationTable entry={token} />
        </div>
      ) : null}
    </>
  );
}

function FragmentRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

/**
 * The word-info popup (#readerWordInfo, ported from views/reader.js
 * renderReaderWordInfo): beside the tapped word on desktop, a bottom sheet
 * (non-modal sheet) on mobile. Opening, closing and outside clicks are controlled
 * by the page. The desktop popup fades and scales in from the word and out again
 * (the last word stays rendered, inert, until the exit finishes); the mobile
 * sheet keeps the kit's own animation handling.
 */
export function ReaderWordInfo({ token, readerTextRef, popupRef, isMobile, mobileFocus, ...handlers }: ReaderWordInfoProps) {
  const { editing } = handlers;
  const { held, release } = useExitHold(token);

  // Position beside the word before paint, so the popup never flashes elsewhere.
  useLayoutEffect(() => {
    const popup = popupRef.current;
    if (isMobile || !token || !popup) {
      return;
    }
    const anchor = readerTextRef.current?.querySelector(`.reader-token[data-token-id="${token.id}"]`);
    if (!anchor) {
      return;
    }
    // offset size: unaffected by the entry scale, unlike getBoundingClientRect.
    const anchorRect = anchor.getBoundingClientRect();
    const { left, top } = wordInfoPosition(
      anchorRect,
      { width: popup.offsetWidth, height: popup.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
      mobileFocus
    );
    popup.style.setProperty("--readerInfoLeft", `${left}px`);
    popup.style.setProperty("--readerInfoTop", `${top}px`);
    popup.style.setProperty("--readerInfoOrigin", left > anchorRect.left ? "left center" : "right center");
  }, [isMobile, mobileFocus, popupRef, readerTextRef, token, editing]);

  if (isMobile) {
    return (
      <ReaderSheet open={token !== null} onClose={handlers.onClose} id="readerWordInfo" className={WORD_INFO_CLASS} contentRef={popupRef}>
        {token ? (
          <WordInfoBody
            key={token.id}
            token={token}
            {...handlers}
            renderTitle={(surface) => (
              <SheetTitle asChild>
                <strong>{surface}</strong>
              </SheetTitle>
            )}
          />
        ) : null}
      </ReaderSheet>
    );
  }

  return (
    <m.aside
      ref={popupRef}
      id="readerWordInfo"
      className={WORD_INFO_CLASS}
      hidden={!held}
      aria-hidden={token ? undefined : true}
      style={token ? undefined : { pointerEvents: "none" }}
      initial={false}
      animate={token ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.97 }}
      transition={token ? MOTION_FADE : MOTION_FADE_FAST}
      onAnimationComplete={() => !token && release()}
    >
      {held ? <WordInfoBody key={held.id} token={held} {...handlers} renderTitle={(surface) => <strong>{surface}</strong>} /> : null}
    </m.aside>
  );
}
