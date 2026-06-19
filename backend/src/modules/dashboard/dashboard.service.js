/**
 * @fileoverview Dashboard service. Assembles the full dashboard payload by
 * composing dashboard repository aggregations with language data. Coordinates
 * with: dashboard repository, languages repository/service.
 */

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

function normalizeDocument(document) {
  const totalWords = Number(document.totalWords || 0);
  const knownWords = Number(document.knownWords || 0);
  const learningWords = Number(document.learningWords || 0);
  const totalTokens = Number(document.totalTokens || document.importedWordCount || 0);
  const readTokens = Math.min(Math.max(Number(document.readTokens || 0), 0), totalTokens);
  return {
    ...document,
    totalWords,
    knownWords,
    learningWords,
    totalTokens,
    readTokens,
    unknownWords: Math.max(0, totalWords - knownWords - learningWords)
  };
}

/**
 * Build the full dashboard payload for the overview tab. Fetches aggregate
 * totals, per-collection breakdowns, the enrolled language list, and the
 * supported study-language options. Collection rows are
 * normalised so numeric fields are never null.
 * Coordinates with: dashboard repository, languages repository/service.
 *
 * @param {object} repositories
 * @param {number} userId
 * @param {number|string|null} languageId - Filters to a single language when provided.
 * @returns {Promise<object>} Dashboard payload ready for the browser view.
 */
export async function getDashboard(repositories, userId, languageId) {
  const selectedLanguageId = Number(languageId) || null;
  const totals = await repositories.dashboard.getTotals(userId, selectedLanguageId);
  const collections = await repositories.dashboard.listCollections(userId, selectedLanguageId);
  const allCollections = await repositories.dashboard.listAllCollections(userId);

  return {
    languages: await getLanguages(repositories, userId),
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

/**
 * Return a normalised, paginated list of the user's materials for the
 * Dashboard Documents tab. Page size is clamped to [1, 50].
 * Coordinates with: dashboard repository.
 *
 * @param {object} repositories
 * @param {number} userId
 * @param {{ languageId?: number, search?: string, limit?: number, offset?: number }} [options]
 * @returns {Promise<{ documents: object[], pageSize: number, offset: number }>}
 */
export async function getDashboardDocuments(repositories, userId, { languageId, search = "", limit = 24, offset = 0 } = {}) {
  const selectedLanguageId = Number(languageId) || null;
  const pageSize = Math.min(Math.max(Number(limit) || 24, 1), 50);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const rows = await repositories.dashboard.listDocumentStats(userId, selectedLanguageId, search, pageSize, safeOffset);
  return {
    documents: rows.map(normalizeDocument),
    pageSize,
    offset: safeOffset
  };
}
