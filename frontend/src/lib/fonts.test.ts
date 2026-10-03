import { describe, expect, it } from "vitest";
import { applyReadingFont, DEFAULT_READING_FONT_ID, getReadingFont, readingFontCssVars, readingFontStack } from "./fonts";

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

  it("puts the SC face first for Chinese", () => {
    expect(readingFontStack(getReadingFont("ia-quattro"), "zh")).toBe(
      '"iA Writer Quattro", "Noto Sans SC Variable", "Noto Sans JP Variable", ui-sans-serif, system-ui, sans-serif'
    );
  });

  it("maps a font to the CSS variables on the root", () => {
    const font = getReadingFont("ia-quattro");
    const vars = readingFontCssVars(font);
    expect(vars["--font-reading-default"]).toBe(readingFontStack(font));
    expect(vars["--font-reading-zh"]).toBe(readingFontStack(font, "zh"));
    const root = document.createElement("html");
    applyReadingFont(font, root);
    expect(root.style.getPropertyValue("--font-reading-default")).toBe(vars["--font-reading-default"]);
  });
});
