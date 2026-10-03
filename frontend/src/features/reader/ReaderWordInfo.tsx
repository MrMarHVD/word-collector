import { useId, useLayoutEffect, useState, type ReactNode, type RefObject } from "react";
import { m } from "motion/react";
import { CloseButton } from "@/components/app/CloseButton";
import { DisambiguationTable, DisambiguationToggle, hasDisambiguation } from "@/components/app/Disambiguation";
import { TranslationOverride } from "@/components/app/TranslationOverride";
import { Segmented } from "@/components/app/Segmented";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { SheetTitle } from "@/components/ui/sheet";
import { Text } from "@/components/ui/text";
import type { ReaderToken, WordStatus } from "@/lib/api/types";
import { useExitHold } from "@/lib/hooks/use-exit-hold";
import { useT } from "@/lib/i18n";
import { MOTION_FADE, MOTION_FADE_FAST } from "@/lib/motion";
import { wordInfoPosition } from "./reader-popup-position";
import { normalizeStatus } from "./reader-tokens";
import { ReaderSheet } from "./ReaderSheet";

const WORD_STATUSES: WordStatus[] = ["unknown", "learning", "known"];

/** Classes of #readerWordInfo: a floating layer (glass); reader.css positions it and turns it into a bottom sheet on mobile. */
const WORD_INFO_CLASS = "reader-word-info fixed z-10 min-w-60 max-w-[min(340px,calc(100vw-24px))] rounded-container p-4 text-main glass shadow-float";

export interface ReaderWordInfoProps {
  /** The word shown, or null when closed. */
  token: ReaderToken | null;
  /** Element to measure for the word's on-screen position (the token's button is looked up inside it). */
  readerTextRef: RefObject<HTMLElement | null>;
  /** Receives the popup element, so outside clicks can be detected. */
  popupRef: RefObject<HTMLElement | null>;
  isMobile: boolean;
  /** The mobile Reader keeps room for the fixed page controls below the sheet. */
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

/** The three-segment status control, with the word id under data-reader-word-id. */
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
    <div data-reader-word-id={wordId}>
      <Segmented
        aria-label={t("table.status")}
        size="sm"
        value={status}
        onValueChange={(next) => void select(next)}
        options={WORD_STATUSES.map((value) => ({
          value,
          label: t(`word.${value}`),
          itemProps: { "data-status": value, "aria-pressed": value === status, disabled: pendingStatus === value }
        }))}
      />
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
  const practiceId = useId();

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
  rows.push({ label: t("table.status"), value: <Badge variant={status}>{t(`word.${status}`)}</Badge> });

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
      <div className="flex items-center gap-2">
        {renderTitle(token.surface)}
        {showDisambiguation ? (
          <DisambiguationToggle className="ml-auto" expanded={disambiguationOpen} onToggle={() => setDisambiguationOpen((open) => !open)} data-disambiguate />
        ) : null}
        <CloseButton
          className={showDisambiguation ? undefined : "ml-auto"}
          label={t("reader.closeTranslation")}
          data-reader-word-info-close
          onClick={onClose}
        />
      </div>
      <dl className="my-3 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1.5 text-body">
        {rows.map((row) => (
          <FragmentRow key={row.label} label={row.label} value={row.value} />
        ))}
      </dl>
      <div className="mb-3 flex items-center gap-2.5" title={canPractice ? undefined : t("reader.practiceHint")}>
        <Checkbox
          id={practiceId}
          data-reader-practice-checkbox
          data-reader-word-id={token.wordId}
          checked={practiceChecked}
          disabled={!canPractice || pendingPractice !== null}
          onCheckedChange={(checked) => void togglePractice(checked === true)}
        />
        <Label htmlFor={practiceId} className="text-body font-medium">
          {t("reader.practice")}
        </Label>
      </div>
      <StatusToggle wordId={token.wordId} status={status} onSelect={(next) => onStatusChange(token.wordId, next)} />
      {showDisambiguation ? (
        <div className="disambiguation-panel mt-3 min-h-0 overflow-auto" data-disambiguation-panel hidden={!disambiguationOpen}>
          <DisambiguationTable entry={token} />
        </div>
      ) : null}
    </>
  );
}

function FragmentRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <dt className="text-label">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
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
                <Text as="strong" variant="heading" className="min-w-0 break-words">
                  {surface}
                </Text>
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
      {held ? (
        <WordInfoBody
          key={held.id}
          token={held}
          {...handlers}
          renderTitle={(surface) => (
            <Text as="strong" variant="heading" className="min-w-0 break-words">
              {surface}
            </Text>
          )}
        />
      ) : null}
    </m.aside>
  );
}
