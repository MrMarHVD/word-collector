import { describe, expect, it } from "vitest";
import { clamp, computeReaderLayout } from "./reader-layout";

describe("clamp", () => {
  it("keeps values in range, preferring the minimum when the range is empty", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
    expect(clamp(5, 8, 4)).toBe(4);
  });
});

describe("computeReaderLayout", () => {
  it("uses half the viewport by default", () => {
    expect(computeReaderLayout({ viewportWidth: 1400, savedPanelWidth: 0 })).toEqual({ minPanelWidth: 360, panelWidth: 700 });
  });

  it("clamps a saved width into the viewport", () => {
    expect(computeReaderLayout({ viewportWidth: 1400, savedPanelWidth: 960 }).panelWidth).toBe(960);
    expect(computeReaderLayout({ viewportWidth: 800, savedPanelWidth: 1120 }).panelWidth).toBe(800);
    expect(computeReaderLayout({ viewportWidth: 1400, savedPanelWidth: 100 }).panelWidth).toBe(360);
  });

  it("never exceeds a viewport narrower than the minimum", () => {
    expect(computeReaderLayout({ viewportWidth: 320, savedPanelWidth: 0 })).toEqual({ minPanelWidth: 320, panelWidth: 320 });
  });
});
