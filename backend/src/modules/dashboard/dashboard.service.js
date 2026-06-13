import { STUDY_LANGUAGE_OPTIONS } from "../../config.js";
import { getLanguages } from "../languages/languages.service.js";

// Dashboard rows are shaped for direct use by the browser views.
// Add numeric progress fields that SQL returns as nullable aggregates.
function normalizeCollection(collection) {
  const totalWords = Number(collection.totalWords || 0);
  const knownWords = Number(collection.knownWords || 0);
  const learningWords = Number(collection.learningWords || 0);
  return {
    ...collection,
    totalWords,
    knownWords,
    learningWords,
    unknownWords: Math.max(0, totalWords - knownWords - learningWords)
  };
}

// Build the dashboard payload for the selected language or all user collections.
export async function getDashboard(repositories, userId, languageId) {
  const selectedLanguageId = Number(languageId) || null;
  const totals = await repositories.dashboard.getTotals(userId, selectedLanguageId);
  const collections = await repositories.dashboard.listCollections(userId, selectedLanguageId);
  const allCollections = await repositories.dashboard.listAllCollections(userId);

  return {
    languages: await getLanguages(repositories, userId),
    predefinedLanguages: await repositories.languages.listPredefined(),
    studyLanguageOptions: STUDY_LANGUAGE_OPTIONS,
    selectedLanguageId,
    totalWords: Number(totals.totalWords || 0),
    knownWords: Number(totals.knownWords || 0),
    learningWords: Number(totals.learningWords || 0),
    wantToPracticeWords: Number(totals.wantToPracticeWords || 0),
    unknownWords: Math.max(0, Number(totals.totalWords || 0) - Number(totals.knownWords || 0) - Number(totals.learningWords || 0)),
    collections: collections.map(normalizeCollection),
    allCollections: allCollections.map(normalizeCollection)
  };
}
