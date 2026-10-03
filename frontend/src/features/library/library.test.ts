import { describe, expect, it } from "vitest";
import { firstGrapheme, readingPercent } from "./library";

describe("firstGrapheme", () => {
  it("uppercases Latin letters and keeps CJK characters", () => {
    expect(firstGrapheme("  moby dick")).toBe("M");
    expect(firstGrapheme("吾輩は猫である")).toBe("吾");
    expect(firstGrapheme("")).toBe("");
  });

  it("keeps a combined emoji whole", () => {
    expect(firstGrapheme("👨‍👩‍👧 family")).toBe("👨‍👩‍👧");
  });
});

describe("readingPercent", () => {
  it("rounds and clamps, and is 0 without tokens", () => {
    expect(readingPercent(1, 3)).toBe(33);
    expect(readingPercent(5, 3)).toBe(100);
    expect(readingPercent(0, 0)).toBe(0);
  });
});
