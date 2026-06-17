/**
 * @fileoverview Word knowledge-status constants and normalisation helper.
 *
 * Defines the canonical ordered list of word statuses used throughout the
 * application. Order is significant: the segmented control in the UI renders
 * the buttons left-to-right in this sequence.
 */

// Word knowledge levels are stored as a status string. Order matters: the
// segmented control renders left-to-right in this order.

/** Ordered list of valid word knowledge statuses. */
export const WORD_STATUSES = ["unknown", "learning", "known"];

/**
 * Normalise an arbitrary value to a valid word status.
 *
 * Returns `"unknown"` for any value not present in {@link WORD_STATUSES}.
 *
 * @param {unknown} value - Candidate status value.
 * @returns {"unknown"|"learning"|"known"} Validated status string.
 */
export function normalizeStatus(value) {
  return WORD_STATUSES.includes(value) ? value : "unknown";
}
