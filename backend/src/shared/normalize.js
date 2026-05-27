// Normalize user-entered names, search terms, and imported text fields.
// Trim text and collapse internal whitespace to single spaces.
export function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}
