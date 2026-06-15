/**
 * @fileoverview Languages service. Business logic for study language management.
 * Validates language names against the supported options list, enforces
 * native/study language constraints, and delegates persistence to the languages
 * repository.
 */

import { ENGLISH_NATIVE_ONLY_STUDY_LANGUAGES, STUDY_LANGUAGE_OPTIONS } from "../../config.js";

export const INVALID_NATIVE_STUDY_LANGUAGE_MESSAGE = "The current study language is not available for the selected native language. Please switch to a valid study language first.";
export const MATCHING_NATIVE_STUDY_LANGUAGE_MESSAGE = "The study language cannot be the same as the native language.";

/**
 * Return `true` when the study language is available for the given native language.
 * Spanish and French require an English native language.
 * @param {string} studyLanguage
 * @param {string} nativeLanguage
 * @returns {boolean}
 */
export function studyLanguageAvailableForNativeLanguage(studyLanguage, nativeLanguage) {
  return studyLanguage !== nativeLanguage && (nativeLanguage === "English" || !ENGLISH_NATIVE_ONLY_STUDY_LANGUAGES.includes(studyLanguage));
}

/**
 * Return `true` when the study/native combination is invalid.
 * @param {string} studyLanguage
 * @param {string} nativeLanguage
 * @returns {boolean}
 */
export function studyLanguageConflictsWithNativeLanguage(studyLanguage, nativeLanguage) {
  return !studyLanguageAvailableForNativeLanguage(studyLanguage, nativeLanguage);
}

/**
 * Return an error descriptor when the study/native combination is invalid,
 * or `null` when the combination is allowed (or either value is absent).
 * @param {string} studyLanguage
 * @param {string} nativeLanguage
 * @returns {{ error: string, errorKey: string }|null}
 */
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

/**
 * Return all languages the user has enrolled in, in alphabetical order.
 * @param {object} repositories
 * @param {number} userId
 * @returns {Promise<Array<{ id: number, name: string }>>}
 */
export function getLanguages(repositories, userId) {
  return repositories.languages.listForUser(userId);
}

/**
 * Resolve a language by id, returning the row only when the user is enrolled.
 * Returns `null` for a non-numeric or falsy `languageId`.
 * @param {object} repositories
 * @param {number} userId
 * @param {number|string|null} languageId
 * @returns {Promise<object|null>}
 */
export function getLanguage(repositories, userId, languageId) {
  const id = Number(languageId) || null;
  return id ? repositories.languages.findById(id, userId) : null;
}

/**
 * Enrol the user in a study language. Rejects names not in the supported
 * options list and combinations that conflict with the user's native language.
 * If the user is already enrolled the existing row is returned without error.
 * @param {object} repositories
 * @param {number} userId
 * @param {string} name - Case-insensitive match against `STUDY_LANGUAGE_OPTIONS`.
 * @param {string} [nativeLanguage="English"]
 * @returns {Promise<{ language: object }|{ error: string, errorKey?: string }>}
 */
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
