import { describe, expect, it } from "vitest";
import { clamp, computeReaderLayout, readerSidebarColumnWidth, type ReaderLayoutInput } from "./reader-layout";

describe("clamp", () => {
  it("keeps values in range, preferring the minimum when the range is empty", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
    expect(clamp(5, 8, 4)).toBe(4);
  });
});

describe("readerSidebarColumnWidth", () => {
  it("is 0 when collapsed and fixed per breakpoint", () => {
    expect(readerSidebarColumnWidth(true, false)).toBe(0);
    expect(readerSidebarColumnWidth(false, false)).toBe(300);
    expect(readerSidebarColumnWidth(false, true)).toBe(240);
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
    savedPanelWidth: 0
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
    const layout = computeReaderLayout({ ...desktop, savedPanelWidth: 600 });
    expect(layout.panelWidth).toBe(600);
    expect(layout.panelHeight).toBe(784);
    expect(layout.panelOffset).toBe(400 - 300);
  });

  it("uses half the viewport and the full height in focus mode", () => {
    const layout = computeReaderLayout({ ...desktop, focusMode: true });
    expect(layout).toMatchObject({ sidebarWidth: 0, panelWidth: 700, panelHeight: 900, minPanelHeight: 900, panelOffset: 350 });
  });

  it("drops the sidebar column when collapsed", () => {
    expect(computeReaderLayout({ ...desktop, sidebarCollapsed: true }).panelWidth).toBe(1400);
  });
});
