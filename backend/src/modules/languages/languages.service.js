import { STUDY_LANGUAGE_OPTIONS } from "../../config.js";

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
export function addStudyLanguageForUser(repositories, userId, name) {
  const candidate = String(name || "").trim();
  const match = STUDY_LANGUAGE_OPTIONS.find((option) => option.toLowerCase() === candidate.toLowerCase());
  if (!match) {
    return { error: "Unsupported study language." };
  }
  const existing = repositories.languages.findByName(userId, match);
  if (existing) {
    return { language: existing };
  }
  repositories.languages.createForUser(userId, match);
  return { language: repositories.languages.findByName(userId, match) };
}
