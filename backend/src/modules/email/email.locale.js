// Maps a user's native language to a supported email locale. The product
// supports three locales (en/ja/zh); everything else falls back to English.
export const SUPPORTED_EMAIL_LOCALES = ["en", "ja", "zh"];
export const DEFAULT_EMAIL_LOCALE = "en";

const NATIVE_LANGUAGE_TO_LOCALE = {
  english: "en",
  japanese: "ja",
  chinese: "zh"
};

// Resolve an email locale from a user's nativeLanguage value (e.g. "Japanese"),
// an explicit locale code (e.g. "ja"), or anything else (falls back to English).
export function resolveEmailLocale(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (SUPPORTED_EMAIL_LOCALES.includes(normalized)) {
    return normalized;
  }
  return NATIVE_LANGUAGE_TO_LOCALE[normalized] || DEFAULT_EMAIL_LOCALE;
}
