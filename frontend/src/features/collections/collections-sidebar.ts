/**
 * Pure sizing of the vocab pane's sidebar column (desktop), mirroring the
 * resting `.collections-workspace` grid in collections.css, so the column can
 * be tweened between its open and collapsed widths.
 */

/** The open sidebar's width (the max of the grid's minmax(220px, 260px) column). */
export const COLLECTIONS_SIDEBAR_WIDTH = 260;
/** The grid's column gap while the sidebar is open. */
export const COLLECTIONS_SIDEBAR_GAP = 14;
/** The workspace shell's max width; it is centred at min(this, viewport - 32px). */
const COLLECTIONS_SHELL_MAX_WIDTH = 1180;
/** Gutter that keeps the fixed re-open button (42px wide) and a small gap clear of the word list. */
const COLLECTIONS_OPEN_BUTTON_GUTTER = 42 + 14;

/**
 * The sidebar column's resting width, gap included: the sidebar and its gap
 * when open, otherwise the left gutter the re-open button needs (zero once the
 * centred shell's own margin clears it).
 */
export function collectionsSidebarColumnWidth(collapsed: boolean, viewportWidth: number): number {
  if (!collapsed) {
    return COLLECTIONS_SIDEBAR_WIDTH + COLLECTIONS_SIDEBAR_GAP;
  }
  const shellMargin = (viewportWidth - Math.min(COLLECTIONS_SHELL_MAX_WIDTH, viewportWidth - 32)) / 2;
  return Math.max(0, COLLECTIONS_OPEN_BUTTON_GUTTER - shellMargin);
}
