/** Pure width arithmetic for the menu bar's collapse-to-hamburger decision (used by `useMenuBarCollapse`). */

/** Extra pixels of room the bar needs before it expands back from the hamburger layout, so it does not flicker at the threshold. */
export const MENU_EXPAND_HYSTERESIS = 24;

export interface MenuWidths {
  /** Horizontal padding of the bar (left plus right). */
  padding: number;
  /** Gap between the bar's two groups. */
  barGap: number;
  /** Gap between the brand and the tabs. */
  innerGap: number;
  /** Natural width of the brand button. */
  brand: number;
  /** Natural width of the tab list, or 0 when the tabs are not shown. */
  tabs: number;
  /** Natural width of the right-hand group (known count, study languages, locale, desktop account buttons). */
  end: number;
}

/** The bar width at which the full desktop menu just fits without overlap. */
export function requiredMenuWidth({ padding, barGap, innerGap, brand, tabs, end }: MenuWidths): number {
  return padding + brand + (tabs > 0 ? innerGap + tabs : 0) + barGap + end;
}

/** Next collapsed state: collapse as soon as the menu does not fit, expand only with `MENU_EXPAND_HYSTERESIS` to spare. */
export function nextCollapsed(collapsed: boolean, required: number, available: number): boolean {
  if (collapsed) {
    return available < required + MENU_EXPAND_HYSTERESIS;
  }
  return available < required;
}
