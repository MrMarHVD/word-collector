/**
 * Reading-font registry (SPEC-005 D1). Entries pair a Latin family with CJK
 * fallbacks; the @font-face rules live in styles/fonts.css. Adding a font means
 * one entry here plus its faces. The registry is the single source of the
 * --font-reading stack: useReadingFont() writes it onto <html> at runtime.
 */

import { useEffect } from "react";

/** One registered reading font. */
export type ReadingFont = {
  id: string;
  label: string;
  latinFamily: string;
  /** CJK families in preference order for Japanese; Chinese text prefers the later SC face (see :lang(zh)). */
  cjkFamilies: string[];
};

/** The registered reading fonts; the first is the default. */
export const READING_FONTS: ReadingFont[] = [
  {
    id: "ia-quattro",
    label: "iA Writer Quattro",
    latinFamily: "iA Writer Quattro",
    cjkFamilies: ["Noto Sans JP Variable", "Noto Sans SC Variable"]
  }
];

/** Id of the font used when nothing else is chosen. */
export const DEFAULT_READING_FONT_ID = "ia-quattro";

/** Returns the registered font for an id, falling back to the default. */
export function getReadingFont(id: string | null | undefined): ReadingFont {
  return READING_FONTS.find((font) => font.id === id) ?? READING_FONTS[0]!;
}

/** Builds the CSS font-family stack for a font. */
export function readingFontStack(font: ReadingFont, lang: "ja" | "zh" = "ja"): string {
  const quote = (family: string) => `"${family}"`;
  const cjk = lang === "zh" ? [...font.cjkFamilies].reverse() : font.cjkFamilies;
  return [font.latinFamily, ...cjk].map(quote).join(", ") + ", ui-sans-serif, system-ui, sans-serif";
}

/** CSS custom properties for a font: the default (Japanese-first) stack and the Chinese-first stack used under :lang(zh). */
export function readingFontCssVars(font: ReadingFont): Record<string, string> {
  return {
    "--font-reading-default": readingFontStack(font),
    "--font-reading-zh": readingFontStack(font, "zh")
  };
}

/** Writes a font's stacks onto the document root so --font-reading (styles/theme.css) resolves to it. */
export function applyReadingFont(font: ReadingFont, root: HTMLElement = document.documentElement): void {
  for (const [name, value] of Object.entries(readingFontCssVars(font))) {
    root.style.setProperty(name, value);
  }
}

/** Applies the active reading font (the registry default until a font picker exists) to <html>. */
export function useReadingFont(id: string | null | undefined = DEFAULT_READING_FONT_ID): void {
  useEffect(() => {
    applyReadingFont(getReadingFont(id));
  }, [id]);
}
