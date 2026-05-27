import { STUDY_LANGUAGE_OPTIONS } from "../../config.js";
import { getLanguages } from "../languages/languages.service.js";

// Dashboard rows are shaped for direct use by the browser views.
// Add numeric progress fields that SQL returns as nullable aggregates.
function normalizeCollection(collection) {
  return {
    ...collection,
    totalWords: Number(collection.totalWords || 0),
    knownWords: Number(collection.knownWords || 0),
    unknownWords: Number(collection.totalWords || 0) - Number(collection.knownWords || 0)
  };
}

// Build the dashboard payload for the selected language or all user collections.
export function getDashboard(repositories, userId, languageId) {
  const selectedLanguageId = Number(languageId) || null;
  const totals = repositories.dashboard.getTotals(userId, selectedLanguageId);
  const collections = repositories.dashboard.listCollections(userId, selectedLanguageId);
  const allCollections = repositories.dashboard.listAllCollections(userId);

  return {
    languages: getLanguages(repositories, userId),
    predefinedLanguages: repositories.languages.listPredefined(),
    studyLanguageOptions: STUDY_LANGUAGE_OPTIONS,
    selectedLanguageId,
    totalWords: Number(totals.totalWords || 0),
    knownWords: Number(totals.knownWords || 0),
    collections: collections.map(normalizeCollection),
    allCollections: allCollections.map(normalizeCollection)
  };
}
