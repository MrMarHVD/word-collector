/**
 * Pure disambiguation logic shared by the reader word-info popup and the vocab
 * table, ported from public/js/views/components/disambiguation.js. Entries are
 * reader tokens or vocab rows; both expose the same translation fields.
 */

import type { DisambiguationCandidate } from "@/lib/api/types";

/** Fields of a reader token or vocab word that the translation components read. */
export interface TranslationEntry {
  translation?: string | null;
  translationOverride?: string | null;
  canonicalTranslation?: string | null;
  disambiguationCandidates?: DisambiguationCandidate[];
  dictionaryForm?: string | null;
  lemma?: string | null;
  surface?: string | null;
  word?: string | null;
}

export interface DisambiguationEntry extends DisambiguationCandidate {
  /** True for the canonical translation in effect before the user's override. */
  original: boolean;
}

/** Whether the entry has a non-empty user translation override. */
export function hasTranslationOverride(entry: TranslationEntry): boolean {
  return typeof entry.translationOverride === "string" && entry.translationOverride.trim().length > 0;
}

function sourceForm(entry: TranslationEntry): string {
  return entry.dictionaryForm || entry.lemma || entry.surface || entry.word || "";
}

/** The canonical translation shown as "original" when an override is set, or null. */
export function originalTranslationCandidate(entry: TranslationEntry): DisambiguationEntry | null {
  if (!hasTranslationOverride(entry) || !entry.canonicalTranslation) {
    return null;
  }
  return { source: sourceForm(entry), translation: entry.canonicalTranslation, pos: "", original: true };
}

/** Candidates with the original translation hoisted first (flagged in place when it matches a candidate). */
export function disambiguationEntries(entry: TranslationEntry): DisambiguationEntry[] {
  const original = originalTranslationCandidate(entry);
  const originalKey = String(original?.translation || "").toLowerCase();
  const candidates = (Array.isArray(entry.disambiguationCandidates) ? entry.disambiguationCandidates : []).map((candidate) => ({
    ...candidate,
    original: Boolean(originalKey && String(candidate.translation || "").toLowerCase() === originalKey)
  }));
  const originalCandidates = candidates.filter((candidate) => candidate.original);
  const otherCandidates = candidates.filter((candidate) => !candidate.original);
  return [...(originalCandidates.length ? originalCandidates : original ? [original] : []), ...otherCandidates];
}

/** Whether to offer the disambiguation control: several entries, or an original translation to show. */
export function hasDisambiguation(entry: TranslationEntry): boolean {
  return disambiguationEntries(entry).length > 1 || Boolean(originalTranslationCandidate(entry));
}
