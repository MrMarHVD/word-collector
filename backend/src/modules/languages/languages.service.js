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

// Create the default study languages for a newly registered user.
export function ensureStudyLanguagesForUser(repositories, userId) {
  for (const language of STUDY_LANGUAGE_OPTIONS) {
    if (!repositories.languages.findByName(userId, language)) {
      repositories.languages.createForUser(userId, language);
    }
  }
}
