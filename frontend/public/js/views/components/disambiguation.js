/**
 * @fileoverview Shared disambiguation logic and rendering for word/token
 * entries. Centralises the "original translation" handling (the canonical
 * translation surfaced when a translation override is set) and the
 * disambiguation candidate table markup, so the reader word-info popup and the
 * vocabulary table render identical behaviour from a single source of truth.
 *
 * Both contexts pass an `entry` exposing the same fields: `canonicalTranslation`,
 * `translationOverride`, `disambiguationCandidates`, and a source form
 * (`dictionaryForm`/`surface` in the reader, `lemma`/`word` in the vocab table).
 */

import { t } from "../../i18n.js";
import { escapeHtml } from "../../shared/html.js";
import { hasTranslationOverride } from "./translation-override.js";

/**
 * Resolves the display source form for an entry, accommodating both reader
 * tokens (`dictionaryForm`/`surface`) and vocabulary rows (`lemma`/`word`).
 *
 * @param {object} entry - The word or token entry.
 * @returns {string} The first available source form, or an empty string.
 */
function sourceForm(entry) {
  return entry.dictionaryForm || entry.lemma || entry.surface || entry.word || "";
}

/**
 * Builds the synthetic "original translation" candidate for an entry — the
 * canonical translation that was in effect before a translation override was
 * applied. Returns `null` when the entry has no override or no canonical
 * translation to fall back to.
 *
 * @param {object} entry - The word or token entry.
 * @returns {{ source: string, translation: string, pos: string, original: true }|null}
 *   The original-translation candidate, or `null` when not applicable.
 */
export function originalTranslationCandidate(entry) {
  if (!hasTranslationOverride(entry) || !entry.canonicalTranslation) {
    return null;
  }
  return {
    source: sourceForm(entry),
    translation: entry.canonicalTranslation,
    pos: "",
    original: true
  };
}

/**
 * Computes the ordered list of disambiguation entries for an entry. The
 * original translation (when present) is hoisted to the front and flagged with
 * `original: true`; if it matches one of the existing candidates that candidate
 * is flagged in place rather than duplicated.
 *
 * @param {object} entry - The word or token entry.
 * @returns {Array<object>} The candidates with `original` flags, original first.
 */
export function disambiguationEntries(entry) {
  const original = originalTranslationCandidate(entry);
  const originalKey = String(original?.translation || "").toLowerCase();
  const candidates = (Array.isArray(entry.disambiguationCandidates) ? entry.disambiguationCandidates : [])
    .map((candidate) => ({
      ...candidate,
      original: Boolean(originalKey && String(candidate.translation || "").toLowerCase() === originalKey)
    }));
  const hasOriginalCandidate = candidates.some((candidate) => candidate.original);
  const originalCandidates = candidates.filter((candidate) => candidate.original);
  const otherCandidates = candidates.filter((candidate) => !candidate.original);
  return [
    ...(hasOriginalCandidate ? originalCandidates : original ? [original] : []),
    ...otherCandidates
  ].filter(Boolean);
}

/**
 * Whether an entry should expose the disambiguation control — true when it has
 * more than one disambiguation entry or an original-translation candidate.
 *
 * @param {object} entry - The word or token entry.
 * @returns {boolean}
 */
export function hasDisambiguation(entry) {
  return disambiguationEntries(entry).length > 1 || Boolean(originalTranslationCandidate(entry));
}

/**
 * Renders the disambiguation candidate `<table>` (header plus one row per
 * entry). The original-translation row is highlighted via the
 * `is-original-translation` class and labelled with the "original" string.
 * Returns an empty string when there are no entries to show.
 *
 * Callers supply their own wrapper: the reader wraps it in a
 * `.disambiguation-panel`, the vocab table in a `.disambiguation-row` cell.
 *
 * @param {object} entry - The word or token entry.
 * @param {{ className?: string }} [options] - Optional configuration.
 * @param {string} [options.className] - Class applied to the `<table>` element.
 * @returns {string} The table HTML string, or an empty string.
 */
export function renderDisambiguationTable(entry, { className = "" } = {}) {
  const entries = disambiguationEntries(entry);
  if (!entries.length) {
    return "";
  }
  const tableClass = className ? ` class="${className}"` : "";
  return `
    <table${tableClass}>
      <thead>
        <tr>
          <th>${escapeHtml(t("table.word"))}</th>
          <th>${escapeHtml(t("table.translation"))}</th>
          <th>${escapeHtml(t("reader.partOfSpeech"))}</th>
        </tr>
      </thead>
      <tbody>
        ${entries.map((candidate) => {
          const pos = candidate.original ? t("translation.original") : candidate.pos ? t(`pos.${candidate.pos}`, {}, candidate.pos) : "";
          return `
            <tr${candidate.original ? ` class="is-original-translation"` : ""}>
              <td>${escapeHtml(candidate.source || "")}</td>
              <td>${escapeHtml(candidate.translation || "")}</td>
              <td>${escapeHtml(pos)}</td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}
