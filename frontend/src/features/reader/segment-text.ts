/**
 * Pure rules for segment selection and sentence translation (SPEC-002
 * contract C3, ported from features/reader/segment-selection.js and
 * views/reader-translation.js): who may drag-select, and how the selected
 * words and their exact source text are rebuilt from token data.
 */

import type { ReaderToken } from "@/lib/api/types";
import { translationModelFor } from "./translation/translation-models";

/** Fewest tokens a selection needs before it is translated. */
export const MIN_SEGMENT_TOKENS = 2;

/** One selected word, in reading order; absent gaps are "". */
export interface SegmentWord {
  tokenId: string;
  surface: string;
  leadingText: string;
  trailingText: string;
}

/**
 * Whether drag-selection for sentence translation applies: only material in a
 * language with a translation model (Japanese, Chinese) read by an English
 * native speaker, compared case-insensitively.
 */
export function isSegmentTranslationEligible(
  material: { languageName?: string | null } | null | undefined,
  user: { nativeLanguage?: string | null } | null | undefined
): boolean {
  return translationModelFor(material?.languageName) !== null && String(user?.nativeLanguage || "").toLowerCase() === "english";
}

/** The selected tokens as segment words. */
export function segmentWords(tokens: ReaderToken[]): SegmentWord[] {
  return tokens.map((token) => ({
    tokenId: String(token.id),
    surface: token.surface,
    leadingText: token.leadingText ?? "",
    trailingText: token.trailingText ?? ""
  }));
}

/** One piece of the rebuilt source: the gap before a word, the word, and the gap after it. */
export interface SourcePiece {
  leading: string;
  surface: string;
  trailing: string;
}

/**
 * Splits the selection into pieces that concatenate to its source text. The
 * text comes from token data, never from the DOM: "show word spaces" injects
 * spaces that are not part of the text. A block's first token carries the text
 * before it in leadingText, so that is kept for every word after the first;
 * the last word's trailing gap is trimmed at the end.
 */
export function segmentSourcePieces(words: SegmentWord[]): SourcePiece[] {
  return words.map((word, index) => ({
    leading: index > 0 ? word.leadingText : "",
    surface: word.surface,
    trailing: index === words.length - 1 ? word.trailingText.trimEnd() : word.trailingText
  }));
}

/** The exact original text of the selection. */
export function segmentSourceText(words: SegmentWord[]): string {
  return segmentSourcePieces(words)
    .map((piece) => piece.leading + piece.surface + piece.trailing)
    .join("");
}
