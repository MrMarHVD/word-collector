/**
 * Reading-font registry (SPEC-005 D1). Entries pair a Latin family with CJK
 * fallbacks; the @font-face rules live in styles/fonts.css. Adding a font means
 * one entry here plus its faces; the --font-reading token carries the default.
 */

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
export function readingFontStack(font: ReadingFont): string {
  const quote = (family: string) => `"${family}"`;
  return [font.latinFamily, ...font.cjkFamilies].map(quote).join(", ") + ", ui-sans-serif, system-ui, sans-serif";
}
