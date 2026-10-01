/**
 * Pure reader sizing (ported from views/reader.js renderReaderSidebar): the
 * sidebar column and the panel's size and centring offset in normal and focus
 * mode. The panel width comes from the reader settings; nothing is resized by
 * pointer.
 */

export const MIN_READER_PANEL_WIDTH = 360;
export const MIN_READER_PANEL_HEIGHT = 520;
export const READER_SIDEBAR_WIDTH = 300;
export const READER_SIDEBAR_WIDTH_SMALL = 240;
export const READER_PANEL_BOTTOM_MARGIN = 16;

/** Clamps `value` into [min, max]; `min` wins when the range is empty. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** The sidebar column width: 0 when collapsed, otherwise the fixed width for the breakpoint. */
export function readerSidebarColumnWidth(collapsed: boolean, mobile: boolean): number {
  if (collapsed) {
    return 0;
  }
  return mobile ? READER_SIDEBAR_WIDTH_SMALL : READER_SIDEBAR_WIDTH;
}

export interface ReaderLayoutInput {
  focusMode: boolean;
  mobile: boolean;
  /** document.documentElement.clientWidth */
  viewportWidth: number;
  /** window.innerHeight */
  viewportHeight: number;
  /** Top of the reader panel in viewport coordinates. */
  panelTop: number;
  sidebarCollapsed: boolean;
  /** The width chosen in the reader settings (focus width in focus mode); 0 = automatic. */
  savedPanelWidth: number;
}

export interface ReaderLayout {
  sidebarWidth: number;
  minPanelWidth: number;
  maxPanelHeight: number;
  minPanelHeight: number;
  panelWidth: number;
  panelHeight: number;
  /** Left margin that centres the panel in the viewport, next to the sidebar. */
  panelOffset: number;
}

/** Resolves the sidebar and panel dimensions for the current viewport. */
export function computeReaderLayout(input: ReaderLayoutInput): ReaderLayout {
  const { focusMode, viewportWidth, viewportHeight } = input;
  const sidebarWidth = focusMode ? 0 : readerSidebarColumnWidth(input.sidebarCollapsed, input.mobile);
  const maxPanelWidth = Math.max(1, viewportWidth - sidebarWidth);
  const maxPanelHeight = focusMode ? Math.max(1, viewportHeight) : Math.max(1, viewportHeight - input.panelTop - READER_PANEL_BOTTOM_MARGIN);
  const minPanelWidth = Math.min(MIN_READER_PANEL_WIDTH, maxPanelWidth);
  const minPanelHeight = focusMode ? maxPanelHeight : Math.min(MIN_READER_PANEL_HEIGHT, maxPanelHeight);
  const defaultPanelWidth = focusMode ? Math.floor(viewportWidth * 0.5) : maxPanelWidth;
  const panelWidth = clamp(input.savedPanelWidth || defaultPanelWidth, minPanelWidth, maxPanelWidth);
  const centeredPanelLeft = Math.max(sidebarWidth, (viewportWidth - panelWidth) / 2);
  return {
    sidebarWidth,
    minPanelWidth,
    maxPanelHeight,
    minPanelHeight,
    panelWidth,
    panelHeight: maxPanelHeight,
    panelOffset: centeredPanelLeft - sidebarWidth
  };
}
