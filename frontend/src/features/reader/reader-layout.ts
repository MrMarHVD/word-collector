/**
 * Pure reader sizing: the reading panel's width in the focus-only reader. The
 * width comes from the reader settings; nothing is resized by pointer.
 */

export const MIN_READER_PANEL_WIDTH = 360;

/** Clamps `value` into [min, max]; `min` wins when the range is empty. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export interface ReaderLayoutInput {
  /** document.documentElement.clientWidth */
  viewportWidth: number;
  /** The width chosen in the reader settings; 0 = automatic (half the viewport). */
  savedPanelWidth: number;
}

export interface ReaderLayout {
  minPanelWidth: number;
  panelWidth: number;
}

/** Resolves the panel width for the current viewport. */
export function computeReaderLayout({ viewportWidth, savedPanelWidth }: ReaderLayoutInput): ReaderLayout {
  const maxPanelWidth = Math.max(1, viewportWidth);
  const minPanelWidth = Math.min(MIN_READER_PANEL_WIDTH, maxPanelWidth);
  const panelWidth = clamp(savedPanelWidth || Math.floor(viewportWidth * 0.5), minPanelWidth, maxPanelWidth);
  return { minPanelWidth, panelWidth };
}
