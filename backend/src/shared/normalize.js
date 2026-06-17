/**
 * @fileoverview Cross-cutting text normalization utilities.
 *
 * Small helpers applied uniformly to user-entered strings before they are
 * persisted or compared, ensuring consistent storage and search behavior.
 */

/**
 * Normalizes a name or short text field by trimming leading/trailing whitespace
 * and collapsing any internal whitespace sequences to a single space.
 *
 * Used for user-entered names, search terms, and imported text fields before
 * persistence so that equivalent inputs are stored identically.
 *
 * @param {unknown} value - Input value; coerced to string via `String()`.
 * @returns {string} Trimmed, whitespace-collapsed string.
 */
export function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}
