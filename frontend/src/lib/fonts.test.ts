import { describe, expect, it } from "vitest";
import { DEFAULT_READING_FONT_ID, getReadingFont, readingFontStack } from "./fonts";

describe("reading font registry", () => {
  it("registers ia-quattro as the default", () => {
    expect(getReadingFont(DEFAULT_READING_FONT_ID).id).toBe("ia-quattro");
  });

  it("falls back to the default for unknown ids", () => {
    expect(getReadingFont("nope").id).toBe("ia-quattro");
  });

  it("lists Latin then CJK families in the stack", () => {
    expect(readingFontStack(getReadingFont("ia-quattro"))).toBe(
      '"iA Writer Quattro", "Noto Sans JP Variable", "Noto Sans SC Variable", ui-sans-serif, system-ui, sans-serif'
    );
  });
});
