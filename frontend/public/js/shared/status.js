// Word knowledge levels are stored as a status string. Order matters: the
// segmented control renders left-to-right in this order.
export const WORD_STATUSES = ["unknown", "learning", "known"];

export function normalizeStatus(value) {
  return WORD_STATUSES.includes(value) ? value : "unknown";
}
