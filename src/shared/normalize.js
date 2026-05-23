// Normalize user-entered names, search terms, and imported text fields.
export function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}
