/**
 * @fileoverview Reusable collapsible-sidebar controller shared by the reader
 * and vocab panes. Standardises the collapse / expand / reopen behaviour: it
 * owns the collapsed state, optionally persists it to localStorage, wires the
 * minimise (head) button and the floating "open" button, and renders the
 * standard side effects — toggling the layout's `is-sidebar-collapsed` class,
 * the minimise button's `aria-expanded`, and the open button's visibility.
 *
 * Panes that compute some of those side effects themselves (the reader, whose
 * layout sizing and open-button visibility depend on focus mode and the active
 * mobile tab) can opt out per aspect via the `manage` flags and react through
 * `onChange` instead.
 */

/** Default set of side effects the controller renders itself. */
const DEFAULT_MANAGE = { layoutClass: true, aria: true, openButton: true };

/**
 * Creates a collapsible-sidebar controller and wires its buttons.
 *
 * @param {object} config - Controller configuration.
 * @param {HTMLElement} config.layout - Element carrying the
 *   `is-sidebar-collapsed` class (the wrapper around the sidebar and content).
 * @param {HTMLElement} [config.toggleButton] - Minimise/expand button inside
 *   the sidebar head.
 * @param {HTMLElement} [config.openButton] - Floating button shown while the
 *   sidebar is collapsed; clicking it expands the sidebar.
 * @param {boolean} [config.collapsed=false] - Initial collapsed state.
 * @param {string|null} [config.storageKey=null] - localStorage key used to
 *   persist the collapsed state; omit to keep the state session-only.
 * @param {{layoutClass?:boolean, aria?:boolean, openButton?:boolean}} [config.manage]
 *   - Which side effects the controller renders itself. Set a flag to `false`
 *   to manage that aspect externally (typically via `onChange`).
 * @param {(collapsed:boolean)=>void} [config.onChange] - Invoked after every
 *   render with the current collapsed value, including the initial render.
 *
 * @returns {{
 *   setCollapsed:(next:boolean, opts?:{persist?:boolean})=>void,
 *   toggle:()=>void,
 *   isCollapsed:()=>boolean,
 *   render:()=>void
 * }} Controller handle.
 */
export function createCollapsibleSidebar({
  layout,
  toggleButton = null,
  openButton = null,
  collapsed = false,
  storageKey = null,
  manage = {},
  onChange = null,
} = {}) {
  const flags = { ...DEFAULT_MANAGE, ...manage };
  let isCollapsed = Boolean(collapsed);

  /** Applies the managed side effects and notifies the caller. */
  function render() {
    if (flags.layoutClass && layout) {
      layout.classList.toggle("is-sidebar-collapsed", isCollapsed);
    }
    if (flags.aria && toggleButton) {
      toggleButton.setAttribute("aria-expanded", String(!isCollapsed));
    }
    if (flags.openButton && openButton) {
      openButton.hidden = !isCollapsed;
    }
    if (typeof onChange === "function") {
      onChange(isCollapsed);
    }
  }

  /**
   * Sets the collapsed state, persists it (when a storage key is configured),
   * and re-renders.
   *
   * @param {boolean} next - The new collapsed value.
   * @param {{persist?:boolean}} [opts] - Set `persist` false to skip writing
   *   localStorage (e.g. when reflecting external state).
   */
  function setCollapsed(next, { persist = true } = {}) {
    isCollapsed = Boolean(next);
    if (persist && storageKey) {
      localStorage.setItem(storageKey, String(isCollapsed));
    }
    render();
  }

  if (toggleButton) {
    toggleButton.addEventListener("click", () => setCollapsed(!isCollapsed));
  }
  if (openButton) {
    openButton.addEventListener("click", () => setCollapsed(false));
  }

  render();

  return {
    setCollapsed,
    toggle: () => setCollapsed(!isCollapsed),
    isCollapsed: () => isCollapsed,
    render,
  };
}
