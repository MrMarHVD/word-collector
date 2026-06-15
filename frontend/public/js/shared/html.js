/**
 * @fileoverview HTML escaping utility used across all template-string view helpers.
 *
 * Provides a single `escapeHtml` function that must be applied to every piece of
 * dynamic data before it is concatenated into an HTML string and assigned to
 * `innerHTML`. This prevents XSS when user-controlled or database-derived text
 * is rendered into the DOM.
 */

/**
 * Escape a value for safe insertion into an HTML string.
 *
 * Replaces the five HTML-sensitive characters (`&`, `<`, `>`, `"`, `'`) with
 * their corresponding named or numeric character references. Always coerces the
 * input to a string via `String(value)` before escaping.
 *
 * @param {unknown} value - The value to escape; will be coerced to string.
 * @returns {string} HTML-safe string.
 */
// Escape interpolated data before inserting HTML strings.
// Replace HTML-sensitive characters with entity-safe values.
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[character];
  });
}
