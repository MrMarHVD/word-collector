import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { CloseButton } from "@/components/app/CloseButton";
import { SheetTitle } from "@/components/ui/sheet";
import { useT } from "@/lib/i18n";
import { sheetClearsAbove, sheetClearsBelow, sheetFallback, translationAnchoredPosition, type Rect } from "./reader-popup-position";
import { ReaderSheet } from "./ReaderSheet";
import { segmentSourcePieces, type SegmentWord } from "./segment-text";
import type { TranslationErrorCode, TranslationProgress } from "./translation/translation.service";

const ERROR_KEYS: Partial<Record<TranslationErrorCode, string>> = {
  unsupported: "reader.translation.error.unsupported",
  "model-unavailable": "reader.translation.error.modelUnavailable",
  failed: "reader.translation.error.failed"
};

/** Base classes of #readerTranslation (legacy index.html); reader.css turns it into a sheet on mobile. */
const TRANSLATION_CLASS = "reader-translation fixed z-10 rounded-lg border border-line bg-panel p-3.5 shadow-panel";

/** What the open popup shows (SPEC-002 contract C4 states). */
export interface ReaderTranslationState {
  /** Identity of the selection; a new selection gets a new id. */
  id: number;
  words: SegmentWord[];
  /** Selection rectangle when it was made. */
  anchorRect: Rect;
  status: "loading-model" | "translating" | "done" | "error";
  progress?: TranslationProgress;
  targetText?: string;
  errorCode?: TranslationErrorCode;
}

export interface ReaderTranslationPopupProps {
  /** The popup's content, or null when closed. */
  translation: ReaderTranslationState | null;
  /** Re-measures the selection, so the popup follows scrolling and reflow; null keeps the last rectangle. */
  getAnchorRect: () => Rect | null;
  readerTextRef: RefObject<HTMLElement | null>;
  isMobile: boolean;
  onClose: () => void;
}

/** The result area: the translation, a progress/translating message, or the localised error. */
function TranslationResult({ translation }: { translation: ReaderTranslationState }) {
  const t = useT();
  if (translation.status === "done") {
    return <p className="reader-translation-target">{translation.targetText ?? ""}</p>;
  }
  if (translation.status === "error") {
    return (
      <p className="reader-translation-message is-error" role="alert">
        {t(ERROR_KEYS[translation.errorCode ?? "failed"] ?? ERROR_KEYS.failed!)}
      </p>
    );
  }
  let message = t("reader.translation.translating");
  if (translation.status === "loading-model") {
    const progress = translation.progress;
    message = progress?.total
      ? t("reader.translation.loadingModelProgress", { percent: Math.min(100, Math.max(0, Math.round((progress.loaded / progress.total) * 100))) })
      : t("reader.translation.loadingModel");
  }
  return <p className="reader-translation-message">{message}</p>;
}

/** The popup's content: the original word by word above its translation. */
function TranslationBody({ translation, onClose, title }: { translation: ReaderTranslationState; onClose: () => void; title: (label: string) => ReactNode }) {
  const t = useT();
  return (
    <>
      <div className="reader-translation-head">
        {title(t("reader.translation.original"))}
        <CloseButton label={t("reader.closeTranslation")} data-reader-translation-close onClick={onClose} />
      </div>
      <p className="reader-translation-source">
        {segmentSourcePieces(translation.words).map((piece, index) => (
          <Fragment key={index}>
            {piece.leading}
            <span className="reader-translation-word" data-source-word-index={index}>
              {piece.surface}
            </span>
            {piece.trailing}
          </Fragment>
        ))}
      </p>
      <span className="reader-translation-label">{t("reader.translation.target")}</span>
      <div className="reader-translation-result" data-reader-translation-result aria-live="polite">
        <TranslationResult translation={translation} />
      </div>
    </>
  );
}

/**
 * The sentence-translation popup (#readerTranslation, ported from
 * views/reader-translation.js): anchored beside the selection on desktop,
 * preferring below and flipping above; on mobile a non-modal bottom sheet
 * that docks at the top when it would cover the selection. When neither side
 * fits, the larger one is used with a capped height, so the selection stays visible.
 */
export function ReaderTranslationPopup({ translation, getAnchorRect, readerTextRef, isMobile, onClose }: ReaderTranslationPopupProps) {
  const popupRef = useRef<HTMLElement | null>(null);
  const anchorRef = useRef<Rect | null>(null);
  const open = translation !== null;

  const position = useCallback(() => {
    const popup = popupRef.current;
    anchorRef.current = getAnchorRect() ?? anchorRef.current;
    const anchor = anchorRef.current;
    if (!popup || !anchor) {
      return;
    }
    popup.style.visibility = "hidden";
    popup.classList.remove("is-docked-top");
    popup.style.removeProperty("--readerTranslationMaxHeight");
    if (isMobile) {
      const bottomRect = popup.getBoundingClientRect();
      if (!sheetClearsBelow(anchor, bottomRect)) {
        popup.classList.add("is-docked-top");
        const topRect = popup.getBoundingClientRect();
        if (!sheetClearsAbove(anchor, topRect)) {
          const fallback = sheetFallback(anchor, bottomRect, topRect);
          popup.classList.toggle("is-docked-top", fallback.dockTop);
          popup.style.setProperty("--readerTranslationMaxHeight", `${fallback.maxHeight}px`);
        }
      }
    } else {
      const rect = popup.getBoundingClientRect();
      const placement = translationAnchoredPosition(anchor, rect, { width: window.innerWidth, height: window.innerHeight });
      if (placement.maxHeight !== null) {
        popup.style.setProperty("--readerTranslationMaxHeight", `${placement.maxHeight}px`);
      }
      popup.style.setProperty("--readerTranslationTop", `${placement.top}px`);
      popup.style.setProperty("--readerTranslationLeft", `${placement.left}px`);
    }
    popup.style.visibility = "";
  }, [getAnchorRect, isMobile]);

  // Re-position whenever the content changes (a new selection or state).
  useLayoutEffect(() => {
    if (translation) {
      anchorRef.current = translation.anchorRect;
      position();
    }
  }, [position, translation]);

  // Follow the selection through resizing and scrolling while open.
  useEffect(() => {
    if (!open) {
      return;
    }
    const readerText = readerTextRef.current;
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position);
    readerText?.addEventListener("scroll", position);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position);
      readerText?.removeEventListener("scroll", position);
    };
  }, [open, position, readerTextRef]);

  if (isMobile) {
    return (
      <ReaderSheet open={open} onClose={onClose} id="readerTranslation" className={TRANSLATION_CLASS} contentRef={popupRef}>
        {translation ? (
          <TranslationBody
            translation={translation}
            onClose={onClose}
            title={(label) => (
              <SheetTitle asChild>
                <span className="reader-translation-label">{label}</span>
              </SheetTitle>
            )}
          />
        ) : null}
      </ReaderSheet>
    );
  }

  return (
    <aside ref={popupRef} id="readerTranslation" className={TRANSLATION_CLASS} hidden={!translation}>
      {translation ? (
        <TranslationBody translation={translation} onClose={onClose} title={(label) => <span className="reader-translation-label">{label}</span>} />
      ) : null}
    </aside>
  );
}
