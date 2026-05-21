export function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}
