/**
 * Test helper: builds reader tokens with only the given fields set, for the
 * reader's unit tests.
 */

import type { ReaderToken } from "@/lib/api/types";

let nextId = 1;

/** A reader token with sequential ids and neutral defaults. */
export function testToken(surface: string, fields: Partial<ReaderToken> = {}): ReaderToken {
  const id = nextId++;
  return {
    id,
    position: id,
    surface,
    lemma: surface,
    pos: null,
    conjugationForm: null,
    wordId: 100 + id,
    blockIndex: null,
    blockType: null,
    leadingText: null,
    trailingText: null,
    dictionaryForm: surface,
    wordPos: null,
    posSubcategory: null,
    reading: null,
    pinyin: null,
    traditional: null,
    canonicalTranslation: null,
    translationOverride: null,
    translation: "",
    status: "unknown",
    wantToPractice: 0,
    ...fields
  };
}
