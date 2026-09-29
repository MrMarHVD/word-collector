/**
 * "Fit to page" measurement (ported from views/reader.js fitReaderTokensToPage).
 * The legacy reader probed by rewriting #readerText itself; here a hidden,
 * identically styled clone of it is probed instead, so React's DOM is never
 * touched and the page renders once with the final token count.
 */

import type { ReaderToken } from "@/lib/api/types";
import { fitTokenCount } from "./reader-pagination";
import { layoutReaderTokens, readerLayoutToHtml } from "./reader-tokens";

/**
 * The largest number of leading `tokens` that fit in `readerText` without
 * overflowing, or null when the element is not laid out (hidden).
 */
export function measureFitTokenCount(
  readerText: HTMLElement,
  tokens: ReaderToken[],
  languageName: string | null | undefined,
  showWordSpaces: boolean
): number | null {
  const parent = readerText.parentElement;
  if (!parent || !readerText.offsetHeight || !tokens.length) {
    return null;
  }
  const probe = readerText.cloneNode(false) as HTMLElement;
  probe.removeAttribute("id");
  probe.classList.remove("is-page-flip-next", "is-page-flip-prev");
  probe.setAttribute("aria-hidden", "true");
  Object.assign(probe.style, {
    position: "absolute",
    top: "0",
    left: "0",
    width: `${readerText.offsetWidth}px`,
    height: `${readerText.offsetHeight}px`,
    visibility: "hidden",
    pointerEvents: "none"
  });
  parent.append(probe);
  try {
    return fitTokenCount(tokens.length, (count) => {
      probe.innerHTML = readerLayoutToHtml(layoutReaderTokens(tokens.slice(0, count), languageName, showWordSpaces));
      return probe.scrollHeight <= probe.clientHeight + 1;
    });
  } finally {
    probe.remove();
  }
}
