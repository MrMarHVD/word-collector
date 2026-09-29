import { describe, expect, it } from "vitest";
import { clamp, computeReaderLayout, readerResizeBounds, readerSidebarColumnWidth, type ReaderLayoutInput } from "./reader-layout";

describe("clamp", () => {
  it("keeps values in range, preferring the minimum when the range is empty", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
    expect(clamp(5, 8, 4)).toBe(4);
  });
});

describe("readerSidebarColumnWidth", () => {
  it("is 0 when collapsed and bounded per breakpoint", () => {
    expect(readerSidebarColumnWidth(true, 300, false)).toBe(0);
    expect(readerSidebarColumnWidth(false, 300, false)).toBe(300);
    expect(readerSidebarColumnWidth(false, 500, false)).toBe(340);
    expect(readerSidebarColumnWidth(false, 100, false)).toBe(240);
    expect(readerSidebarColumnWidth(false, 300, true)).toBe(240);
    expect(readerSidebarColumnWidth(false, 100, true)).toBe(160);
  });
});

describe("computeReaderLayout", () => {
  const desktop: ReaderLayoutInput = {
    focusMode: false,
    mobile: false,
    viewportWidth: 1400,
    viewportHeight: 900,
    panelTop: 100,
    sidebarCollapsed: false,
    sidebarWidth: 300,
    savedPanelWidth: 0,
    savedPanelHeight: 0
  };

  it("fills the space beside the sidebar and down to the bottom margin by default", () => {
    expect(computeReaderLayout(desktop)).toEqual({
      sidebarWidth: 300,
      minPanelWidth: 360,
      maxPanelHeight: 784,
      minPanelHeight: 520,
      panelWidth: 1100,
      panelHeight: 784,
      panelOffset: 0
    });
  });

  it("clamps a saved size and centres a narrower panel in the viewport", () => {
    const layout = computeReaderLayout({ ...desktop, savedPanelWidth: 600, savedPanelHeight: 300 });
    expect(layout.panelWidth).toBe(600);
    expect(layout.panelHeight).toBe(520);
    expect(layout.panelOffset).toBe(400 - 300);
  });

  it("uses half the viewport and the full height in focus mode", () => {
    const layout = computeReaderLayout({ ...desktop, focusMode: true, savedPanelHeight: 300 });
    expect(layout).toMatchObject({ sidebarWidth: 0, panelWidth: 700, panelHeight: 900, minPanelHeight: 900, panelOffset: 350 });
  });

  it("drops the sidebar column when collapsed", () => {
    expect(computeReaderLayout({ ...desktop, sidebarCollapsed: true }).panelWidth).toBe(1400);
  });
});

describe("readerResizeBounds", () => {
  const input = { mobile: false, layoutWidth: 1400, sidebarWidth: 300, panelTop: 100, viewportHeight: 900 };

  it("bounds the sidebar between its minimum and maximum widths", () => {
    expect(readerResizeBounds({ ...input, target: "sidebar" })).toEqual({ minWidth: 240, maxWidth: 340, minHeight: 320, maxHeight: 810 });
    expect(readerResizeBounds({ ...input, target: "sidebar", mobile: true })).toMatchObject({ minWidth: 160, maxWidth: 240 });
  });

  it("bounds the panel by the space beside the sidebar and below its top", () => {
    expect(readerResizeBounds({ ...input, target: "panel" })).toEqual({ minWidth: 360, maxWidth: 1100, minHeight: 520, maxHeight: 784 });
  });
});
