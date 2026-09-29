/**
 * Pure reader sizing (ported from views/reader.js renderReaderSidebar and
 * reader.controller.js startReaderResize): the sidebar column, the panel's
 * size and centring offset in normal and focus mode, and the drag bounds of
 * the resize handles.
 */

export const MIN_READER_PANEL_WIDTH = 360;
export const MIN_READER_PANEL_HEIGHT = 520;
export const MAX_READER_SIDEBAR_WIDTH = 340;
export const MAX_READER_SIDEBAR_WIDTH_SMALL = 240;
export const READER_PANEL_BOTTOM_MARGIN = 16;

/** Clamps `value` into [min, max]; `min` wins when the range is empty. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** The sidebar column width: 0 when collapsed, otherwise the saved width within the breakpoint's bounds. */
export function readerSidebarColumnWidth(collapsed: boolean, savedWidth: number, mobile: boolean): number {
  if (collapsed) {
    return 0;
  }
  const minimumWidth = mobile ? 160 : 240;
  const maximumWidth = mobile ? MAX_READER_SIDEBAR_WIDTH_SMALL : MAX_READER_SIDEBAR_WIDTH;
  return Math.max(minimumWidth, Math.min(savedWidth, maximumWidth));
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
  sidebarWidth: number;
  /** Last resolved panel width (focus width in focus mode); 0 = automatic. */
  savedPanelWidth: number;
  /** Last resolved panel height (ignored in focus mode); 0 = automatic. */
  savedPanelHeight: number;
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
  const sidebarWidth = focusMode ? 0 : readerSidebarColumnWidth(input.sidebarCollapsed, input.sidebarWidth, input.mobile);
  const maxPanelWidth = Math.max(1, viewportWidth - sidebarWidth);
  const maxPanelHeight = focusMode ? Math.max(1, viewportHeight) : Math.max(1, viewportHeight - input.panelTop - READER_PANEL_BOTTOM_MARGIN);
  const minPanelWidth = Math.min(MIN_READER_PANEL_WIDTH, maxPanelWidth);
  const minPanelHeight = focusMode ? maxPanelHeight : Math.min(MIN_READER_PANEL_HEIGHT, maxPanelHeight);
  const savedPanelHeight = focusMode ? 0 : input.savedPanelHeight;
  const defaultPanelWidth = focusMode ? Math.floor(viewportWidth * 0.5) : maxPanelWidth;
  const panelWidth = clamp(input.savedPanelWidth || defaultPanelWidth, minPanelWidth, maxPanelWidth);
  const panelHeight = focusMode ? maxPanelHeight : savedPanelHeight ? clamp(savedPanelHeight, minPanelHeight, maxPanelHeight) : maxPanelHeight;
  const centeredPanelLeft = Math.max(sidebarWidth, (viewportWidth - panelWidth) / 2);
  return {
    sidebarWidth,
    minPanelWidth,
    maxPanelHeight,
    minPanelHeight,
    panelWidth,
    panelHeight,
    panelOffset: centeredPanelLeft - sidebarWidth
  };
}

export type ResizeTarget = "sidebar" | "panel";

export interface ResizeBoundsInput {
  target: ResizeTarget;
  mobile: boolean;
  /** Width of the reader layout element. */
  layoutWidth: number;
  /** Rendered sidebar width, or 0 when it is hidden (focus mode, collapsed). */
  sidebarWidth: number;
  panelTop: number;
  viewportHeight: number;
}

export interface ResizeBounds {
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
}

/** Drag bounds for a resize handle, measured when the drag starts. */
export function readerResizeBounds({ target, mobile, layoutWidth, sidebarWidth, panelTop, viewportHeight }: ResizeBoundsInput): ResizeBounds {
  const availablePanelWidth = Math.max(1, Math.floor(layoutWidth - sidebarWidth));
  const minPanelWidth = Math.min(MIN_READER_PANEL_WIDTH, availablePanelWidth);
  const minWidth = target === "sidebar" ? (mobile ? 160 : 240) : minPanelWidth;
  const maxSidebarWidth = mobile ? MAX_READER_SIDEBAR_WIDTH_SMALL : MAX_READER_SIDEBAR_WIDTH;
  const maxWidth = target === "panel" ? Math.max(minPanelWidth, availablePanelWidth) : Math.max(minWidth, maxSidebarWidth);
  const maxPanelHeight = Math.max(1, viewportHeight - panelTop - READER_PANEL_BOTTOM_MARGIN);
  const minHeight = target === "panel" ? Math.min(MIN_READER_PANEL_HEIGHT, maxPanelHeight) : 320;
  const maxHeight = target === "panel" ? maxPanelHeight : Math.max(minHeight, viewportHeight - 90);
  return { minWidth, maxWidth, minHeight, maxHeight };
}
