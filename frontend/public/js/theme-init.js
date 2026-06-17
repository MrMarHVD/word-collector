/**
 * @fileoverview Synchronous theme bootstrap that prevents a flash of wrong theme on page load.
 *
 * Reads the persisted theme preference from `localStorage` and sets
 * `document.documentElement.dataset.theme` and `.dataset.themePreference` before
 * the first paint. This file must be loaded as a classic (non-module) `<script>` in
 * `<head>` so it executes synchronously; a module script would be deferred and
 * reintroduce the flash. It is kept as an external file rather than inlined in order
 * to satisfy the page's strict Content Security Policy.
 *
 * Valid stored values: `"system"` | `"light"` | `"dark"`. Any unrecognised value
 * is normalised to `"system"`. When the preference is `"system"`, the resolved
 * theme is determined by `prefers-color-scheme`.
 */

// Applies the saved theme before first paint to avoid a flash of the wrong
// theme. Loaded as a classic (non-module) script in <head> so it runs
// synchronously before the stylesheet — a module would defer and reintroduce
// the flash. Kept external (rather than inline) to satisfy the strict CSP.
(() => {
  let preference = "system";
  try {
    preference = localStorage.getItem("wordMarkerTheme") || "system";
  } catch {
    preference = "system";
  }
  if (!["system", "light", "dark"].includes(preference)) {
    preference = "system";
  }
  const theme = preference === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : preference;
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.themePreference = preference;
})();
