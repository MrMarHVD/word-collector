import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { m } from "motion/react";
import { CloseButton } from "@/components/app/CloseButton";
import { SheetTitle } from "@/components/ui/sheet";
import { Text } from "@/components/ui/text";
import { useExitHold } from "@/lib/hooks/use-exit-hold";
import { useT } from "@/lib/i18n";
import { MOTION_FADE, MOTION_FADE_FAST } from "@/lib/motion";
import { sheetClearsAbove, sheetClearsBelow, sheetFallback, translationAnchoredPosition, type Rect } from "./reader-popup-position";
import { ReaderSheet } from "./ReaderSheet";
import { segmentSourcePieces, type SegmentWord } from "./segment-text";
import type { TranslationErrorCode, TranslationProgress } from "./translation/translation.service";

const ERROR_KEYS: Partial<Record<TranslationErrorCode, string>> = {
  unsupported: "reader.translation.error.unsupported",
  "model-unavailable": "reader.translation.error.modelUnavailable",
  failed: "reader.translation.error.failed"
};

/** Classes of #readerTranslation: a floating layer (glass); reader.css positions it and turns it into a sheet on mobile. */
const TRANSLATION_CLASS = "reader-translation fixed z-10 rounded-container p-4 text-main glass shadow-float";

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
    return <Text className="reader-translation-target break-words font-reading leading-[1.6]">{translation.targetText ?? ""}</Text>;
  }
  if (translation.status === "error") {
    return (
      <Text className="reader-translation-message break-words text-destructive" role="alert">
        {t(ERROR_KEYS[translation.errorCode ?? "failed"] ?? ERROR_KEYS.failed!)}
      </Text>
    );
  }
  let message = t("reader.translation.translating");
  if (translation.status === "loading-model") {
    const progress = translation.progress;
    message = progress?.total
      ? t("reader.translation.loadingModelProgress", { percent: Math.min(100, Math.max(0, Math.round((progress.loaded / progress.total) * 100))) })
      : t("reader.translation.loadingModel");
  }
  return (
    <Text tone="label" className="reader-translation-message break-words">
      {message}
    </Text>
  );
}

/** The popup's content: the original word by word above its translation. */
function TranslationBody({ translation, onClose, title }: { translation: ReaderTranslationState; onClose: () => void; title: (label: string) => ReactNode }) {
  const t = useT();
  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-3">
        {title(t("reader.translation.original"))}
        <CloseButton label={t("reader.closeTranslation")} data-reader-translation-close onClick={onClose} />
      </div>
      <Text variant="heading" className="mb-3 break-words border-b border-line pb-3 font-reading font-normal leading-[1.6]">
        {segmentSourcePieces(translation.words).map((piece, index) => (
          <Fragment key={index}>
            {piece.leading}
            <span data-source-word-index={index}>{piece.surface}</span>
            {piece.trailing}
          </Fragment>
        ))}
      </Text>
      <Text variant="caption" tone="label" className="block font-medium">
        {t("reader.translation.target")}
      </Text>
      <div className="mt-1.5" data-reader-translation-result aria-live="polite">
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
 * The desktop popup fades and scales in from the selection and out again (the
 * last translation stays rendered, inert, until the exit finishes).
 */
export function ReaderTranslationPopup({ translation, getAnchorRect, readerTextRef, isMobile, onClose }: ReaderTranslationPopupProps) {
  const popupRef = useRef<HTMLElement | null>(null);
  const anchorRef = useRef<Rect | null>(null);
  const open = translation !== null;
  const { held, release } = useExitHold(translation);

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
      // offset size: unaffected by the entry scale, unlike getBoundingClientRect.
      const size = { width: popup.offsetWidth, height: popup.offsetHeight };
      const placement = translationAnchoredPosition(anchor, size, { width: window.innerWidth, height: window.innerHeight });
      if (placement.maxHeight !== null) {
        popup.style.setProperty("--readerTranslationMaxHeight", `${placement.maxHeight}px`);
      }
      popup.style.setProperty("--readerTranslationTop", `${placement.top}px`);
      popup.style.setProperty("--readerTranslationLeft", `${placement.left}px`);
      popup.style.setProperty("--readerTranslationOrigin", placement.top >= anchor.bottom ? "center top" : "center bottom");
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
                <Text variant="caption" tone="label" className="font-medium">
                  {label}
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
      id="readerTranslation"
      className={TRANSLATION_CLASS}
      hidden={!held}
      aria-hidden={open ? undefined : true}
      style={open ? undefined : { pointerEvents: "none" }}
      initial={false}
      animate={open ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.97 }}
      transition={open ? MOTION_FADE : MOTION_FADE_FAST}
      onAnimationComplete={() => !open && release()}
    >
      {held ? (
        <TranslationBody
          translation={held}
          onClose={onClose}
          title={(label) => (
            <Text variant="caption" tone="label" className="font-medium">
              {label}
            </Text>
          )}
        />
      ) : null}
    </m.aside>
  );
}
