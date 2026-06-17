/**
 * @fileoverview Lightweight parser for the two-column word-import text format.
 *
 * Accepts plain text where each non-empty line represents one word–translation
 * pair. Supported delimiters (tried in order): comma (`,`), semicolon (`;`),
 * tab (`\t`), and a single whitespace gap between the first token and the rest
 * of the line. Lines that cannot be parsed into a word and a translation are
 * silently dropped.
 */

/**
 * Parse a multi-line text string into an array of word–translation pairs.
 *
 * Each line is split on the first detected delimiter. Recognised delimiters are
 * `,`, `;`, `\t`, and whitespace (first word vs. remainder). Lines that yield
 * either an empty word or an empty translation after trimming are excluded.
 *
 * @param {string} text - Raw text content from a CSV, TSV, or plain-text file.
 * @returns {Array<{word: string, translation: string}>} Parsed entries; may be empty.
 */
// Small CSV parser for the two-column word import format.
// Parse word and translation rows from CSV, semicolon, tab, or whitespace text.
export function parseCsv(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = [",", ";", "\t"].find((candidate) => line.includes(candidate));
      if (separator) {
        const [word, ...translation] = line.split(separator);
        return { word: word?.trim(), translation: translation.join(separator).trim() };
      }

      const match = line.match(/^(\S+)\s+(.+)$/);
      return match ? { word: match[1].trim(), translation: match[2].trim() } : null;
    })
    .filter((entry) => entry?.word && entry?.translation);
}
