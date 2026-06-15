/**
 * @fileoverview Email locale resolution. Maps a user's native language value
 * (or an explicit locale code) to one of the three supported email locales:
 * `"en"`, `"ja"`, or `"zh"`. Everything else falls back to English.
 */

// Maps a user's native language to a supported email locale. The product
// supports three locales (en/ja/zh); everything else falls back to English.
export const SUPPORTED_EMAIL_LOCALES = ["en", "ja", "zh"];
export const DEFAULT_EMAIL_LOCALE = "en";

const NATIVE_LANGUAGE_TO_LOCALE = {
  english: "en",
  japanese: "ja",
  chinese: "zh"
};

/**
 * Resolve an email locale from a user's `nativeLanguage` value (e.g. `"Japanese"`),
 * an explicit locale code (e.g. `"ja"`), or any other string (falls back to `"en"`).
 * @param {string|undefined} value
 * @returns {"en"|"ja"|"zh"}
 */
export function resolveEmailLocale(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (SUPPORTED_EMAIL_LOCALES.includes(normalized)) {
    return normalized;
  }
  return NATIVE_LANGUAGE_TO_LOCALE[normalized] || DEFAULT_EMAIL_LOCALE;
}
