/**
 * @fileoverview Close button component — renders the shared circular "×"
 * button used by reader popups. The icon is an inline SVG centred with grid,
 * so it stays centred regardless of font glyph metrics. Styled by
 * `.close-button` in `css/base.css`.
 */

import { escapeHtml } from "../../shared/html.js";

/**
 * Returns the HTML string for a circular close button.
 *
 * @param {object} options
 * @param {string} options.dataAttr - Data attribute name (without value) the
 *   caller's click handler matches, e.g. `"data-reader-word-info-close"`.
 * @param {string} options.label - Localised accessible label.
 * @returns {string} HTML string for the button.
 */
export function renderCloseButton({ dataAttr, label }) {
  return `<button class="close-button" type="button" ${dataAttr} aria-label="${escapeHtml(label)}">
    <svg aria-hidden="true" viewBox="0 0 24 24" class="close-button-icon">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  </button>`;
}
