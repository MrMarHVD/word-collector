import { ENGLISH_NATIVE_ONLY_STUDY_LANGUAGES, STUDY_LANGUAGE_OPTIONS } from "../../config.js";

export const INVALID_NATIVE_STUDY_LANGUAGE_MESSAGE = "The current study language is not available for the selected native language. Please switch to a valid study language first.";
export const MATCHING_NATIVE_STUDY_LANGUAGE_MESSAGE = "The study language cannot be the same as the native language.";

export function studyLanguageAvailableForNativeLanguage(studyLanguage, nativeLanguage) {
  return studyLanguage !== nativeLanguage && (nativeLanguage === "English" || !ENGLISH_NATIVE_ONLY_STUDY_LANGUAGES.includes(studyLanguage));
}

export function studyLanguageConflictsWithNativeLanguage(studyLanguage, nativeLanguage) {
  return !studyLanguageAvailableForNativeLanguage(studyLanguage, nativeLanguage);
}

export function nativeStudyLanguageConflict(studyLanguage, nativeLanguage) {
  if (!studyLanguage || !nativeLanguage) {
    return null;
  }
  if (studyLanguage === nativeLanguage) {
    return { error: MATCHING_NATIVE_STUDY_LANGUAGE_MESSAGE, errorKey: "errors.matchingNativeStudyLanguage" };
  }
  if (studyLanguageConflictsWithNativeLanguage(studyLanguage, nativeLanguage)) {
    return { error: INVALID_NATIVE_STUDY_LANGUAGE_MESSAGE, errorKey: "errors.invalidNativeStudyLanguage" };
  }
  return null;
}

// Languages are user-owned, while the allowed study-language names are fixed.
// Return all languages available to a user in display order.
export function getLanguages(repositories, userId) {
  return repositories.languages.listForUser(userId);
}

// Resolve a language id only when it belongs to the current user.
export function getLanguage(repositories, userId, languageId) {
  const id = Number(languageId) || null;
  return id ? repositories.languages.findById(id, userId) : null;
}

// Add a single study language to the user's enrolled list. Names that aren't
// part of the supported study options are rejected.
export async function addStudyLanguageForUser(repositories, userId, name, nativeLanguage = "English") {
  const candidate = String(name || "").trim();
  const match = STUDY_LANGUAGE_OPTIONS.find((option) => option.toLowerCase() === candidate.toLowerCase());
  if (!match) {
    return { error: "Unsupported study language." };
  }
  const conflict = nativeStudyLanguageConflict(match, nativeLanguage);
  if (conflict) {
    return conflict;
  }
  const existing = await repositories.languages.findByName(userId, match);
  if (existing) {
    return { language: existing };
  }
  await repositories.languages.createForUser(userId, match);
  return { language: await repositories.languages.findByName(userId, match) };
}
