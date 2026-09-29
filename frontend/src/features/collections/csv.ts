/**
 * Parser for the two-column word-import text format (ported from
 * public/js/csv.js). Each non-empty line is one word/translation pair, split
 * on the first delimiter found: comma, semicolon, tab, or else the first
 * whitespace gap. Lines without both a word and a translation are dropped.
 */

import type { ImportWordRow } from "@/lib/api/types";

const SEPARATORS = [",", ";", "\t"];

/** Parses CSV, semicolon, tab or whitespace-separated text into word/translation rows. */
export function parseCsv(text: string): ImportWordRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line): ImportWordRow | null => {
      const separator = SEPARATORS.find((candidate) => line.includes(candidate));
      if (separator) {
        const [word, ...translation] = line.split(separator);
        return { word: word.trim(), translation: translation.join(separator).trim() };
      }
      const match = line.match(/^(\S+)\s+(.+)$/);
      return match ? { word: match[1].trim(), translation: match[2].trim() } : null;
    })
    .filter((entry): entry is ImportWordRow => Boolean(entry?.word && entry.translation));
}
