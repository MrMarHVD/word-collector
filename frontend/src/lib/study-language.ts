/**
 * Pure study-language rules, ported from public/js/app/study-language.js.
 * A language is unavailable when it is the user's native language, and
 * Spanish/French are only offered to native English speakers.
 */

import type { Language } from "@/lib/api/types";

const ENGLISH_ONLY_STUDY_LANGUAGES = ["Spanish", "French"];

/** Localisation key of a study language's display name (e.g. "studyLanguage.Japanese"). */
export function studyLanguageLabelKey(name: string): string {
  return `studyLanguage.${name}`;
}

/** Whether a study language may be studied with the given native language. */
export function isStudyLanguageAvailable(name: string, nativeLanguage: string | null | undefined): boolean {
  return name !== nativeLanguage && (nativeLanguage === "English" || !ENGLISH_ONLY_STUDY_LANGUAGES.includes(name));
}

/** Localisation key explaining why a study language is unavailable, or "" when it is available. */
export function unavailableStudyLanguageReasonKey(name: string, nativeLanguage: string | null | undefined): string {
  if (name === nativeLanguage) {
    return "errors.matchingNativeStudyLanguage";
  }
  if (nativeLanguage !== "English" && ENGLISH_ONLY_STUDY_LANGUAGES.includes(name)) {
    return "errors.invalidNativeStudyLanguage";
  }
  return "";
}

/** Case-insensitive lookup of a language by name. */
export function languageByName(languages: Language[], name: string): Language | undefined {
  return languages.find((language) => language.name.toLowerCase() === name.toLowerCase());
}

/** Enrolled languages in canonical option order, excluding those unavailable for the native language. */
export function availableStudyLanguages(options: string[], languages: Language[], nativeLanguage: string | null | undefined): Language[] {
  return options
    .map((name) => languageByName(languages, name))
    .filter((language): language is Language => Boolean(language))
    .filter((language) => isStudyLanguageAvailable(language.name, nativeLanguage));
}

export interface StudyLanguageMenuOption {
  name: string;
  enrolled: boolean;
  /** Localisation key of the reason the option is disabled, or "". */
  reasonKey: string;
}

/** Entries of the "add language" menu: every non-enrolled option plus enrolled-but-unavailable ones (shown disabled). */
export function studyLanguageMenuOptions(options: string[], languages: Language[], nativeLanguage: string | null | undefined): StudyLanguageMenuOption[] {
  return options
    .map((name) => ({
      name,
      enrolled: languages.some((language) => language.name.toLowerCase() === name.toLowerCase()),
      reasonKey: unavailableStudyLanguageReasonKey(name, nativeLanguage)
    }))
    .filter((option) => !option.enrolled || option.reasonKey);
}

/** Names the user can enrol in right now (used by the welcome language gate). */
export function addableStudyLanguages(options: string[], languages: Language[], nativeLanguage: string | null | undefined): string[] {
  return studyLanguageMenuOptions(options, languages, nativeLanguage)
    .filter((option) => !option.enrolled && !option.reasonKey)
    .map((option) => option.name);
}

/** First available enrolled language by localised label, or null (used after a native-language change). */
export function firstAvailableStudyLanguageAlphabetically(
  options: string[],
  languages: Language[],
  nativeLanguage: string | null | undefined,
  label: (name: string) => string
): Language | null {
  return [...availableStudyLanguages(options, languages, nativeLanguage)].sort((left, right) => label(left.name).localeCompare(label(right.name)))[0] || null;
}
