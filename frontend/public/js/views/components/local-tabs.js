/**
 * @fileoverview Local tabs component — lightweight helpers for rendering and
 * binding small tab groups that are scoped to a single panel (e.g. the
 * dashboard stats tabs). Tab state is managed by the caller; these helpers
 * only handle DOM synchronisation and event wiring.
 */

/**
 * Synchronises a set of tab buttons with the currently active value. The
 * active button receives `is-active` and `aria-selected="true"`; all others
 * receive `aria-selected="false"`.
 *
 * @param {NodeList|Array<Element>} buttons - The tab button elements to update.
 * @param {string} activeValue - The value that identifies the active tab.
 * @param {{ valueAttribute?: string }} [options]
 * @param {string} [options.valueAttribute="data-local-tab"] - The attribute on
 *   each button that holds its tab value.
 *
 * @sideeffects
 * - Toggles `is-active` on each button.
 * - Sets `aria-selected` on each button.
 */
export function renderLocalTabs(buttons, activeValue, { valueAttribute = "data-local-tab" } = {}) {
  buttons.forEach((button) => {
    const active = button.getAttribute(valueAttribute) === activeValue;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
}

/**
 * Attaches click event listeners to each tab button. When clicked, the
 * button's tab value is read from `valueAttribute` and passed to `onSelect`.
 *
 * @param {NodeList|Array<Element>} buttons - The tab button elements to wire.
 * @param {function(string): void} onSelect - Callback invoked with the selected
 *   tab value whenever a tab button is clicked.
 * @param {{ valueAttribute?: string }} [options]
 * @param {string} [options.valueAttribute="data-local-tab"] - The attribute on
 *   each button that holds its tab value.
 *
 * @sideeffects
 * - Adds a `"click"` event listener to each button.
 */
export function bindLocalTabs(buttons, onSelect, { valueAttribute = "data-local-tab" } = {}) {
  buttons.forEach((button) => {
    button.addEventListener("click", () => onSelect(button.getAttribute(valueAttribute)));
  });
}
