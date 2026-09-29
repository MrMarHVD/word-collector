/**
 * @fileoverview Translation feature controller — connects reader segment
 * selection to the on-device translation service and the reader translation
 * popup. A `reader:segment-selected` event closes word-info, opens the popup
 * and runs the translation, feeding its status and result into the popup.
 * Closing the popup clears the selection highlight, and the popup closes
 * whenever the selection can no longer be shown (reader re-render, page turn
 * or leaving the reader view).
 */

import { elements } from "../../dom.js";
import { closeReaderTranslation, isReaderTranslationOpen, openReaderTranslation, setReaderTranslationState } from "../../views/reader-translation.js";
import { closeReaderWordInfo } from "../reader/reader.controller.js";
import { clearReaderSegmentSelection, readerSegmentAnchorRect } from "../reader/segment-selection.js";
import { translate, TranslationError } from "./translation.service.js";

/** Identity of the selection the open popup shows; `null` once closed. */
let activeSelection = null;

function handleTranslationClose() {
  activeSelection = null;
  clearReaderSegmentSelection();
}

async function handleSegmentSelected(event) {
  const { words, sourceText, anchorRect } = event.detail;
  const selection = {};
  closeReaderWordInfo();
  openReaderTranslation({ words, sourceText, anchorRect, getAnchorRect: readerSegmentAnchorRect, onClose: handleTranslationClose });
  activeSelection = selection;
  // Late results for a closed or replaced popup are dropped.
  const isCurrent = () => activeSelection === selection;
  try {
    const result = await translate(sourceText, {
      onStatus: (status, info) => {
        if (!isCurrent()) {
          return;
        }
        if (status === "loading-model") {
          setReaderTranslationState({ status, progress: info });
        } else if (status === "translating") {
          setReaderTranslationState({ status });
        }
      }
    });
    if (isCurrent()) {
      setReaderTranslationState({ status: "done", targetText: result.targetText });
    }
  } catch (error) {
    const errorCode = error instanceof TranslationError ? error.code : "failed";
    if (errorCode !== "superseded" && isCurrent()) {
      setReaderTranslationState({ status: "error", errorCode });
    }
  }
}

function closeTranslationIfOpen() {
  if (isReaderTranslationOpen()) {
    closeReaderTranslation();
  }
}

/**
 * Attaches the translation listeners: the segment-selected handler, plus an
 * observer that closes the popup when the reader tokens are re-rendered or the
 * reader view is hidden. Re-renders go through several view helpers, so
 * observing the DOM catches all of them in one place.
 */
export function bindTranslationEvents() {
  document.addEventListener("reader:segment-selected", handleSegmentSelected);
  const observer = new MutationObserver(closeTranslationIfOpen);
  observer.observe(elements.readerText, { childList: true });
  observer.observe(elements.readerView, { attributes: true, attributeFilter: ["hidden"] });
}
