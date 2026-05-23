import { READER_WORK_PAGE_SIZE } from "../config.js";
import { normalizeName } from "../shared/normalize.js";
import { extractTextFromUpload } from "./textExtraction.js";
import { tokenizeForLanguage } from "./lemmatizer.js";
import { getTranslationCandidates, hasTranslationAttempt, hasUsableStoredTranslation, materialTranslationStatus, scheduleMaterialTranslationBackfill, supportedTargetNativeLanguage, translationForToken } from "./translations.js";

const UNCOLLECTED_COLLECTION_NAME = "Uncollected";

// Reader imports place auto-discovered words in a stable collection instead of
// requiring users to create one before importing material.
// Return the user's auto-created collection for imported reader words.
function getUncollectedCollection(db, statements, userId, languageId) {
  let collection = statements.collectionByName.get(userId, languageId, UNCOLLECTED_COLLECTION_NAME);
  if (!collection) {
    statements.createCollection.run(languageId, UNCOLLECTED_COLLECTION_NAME);
    collection = statements.collectionByName.get(userId, languageId, UNCOLLECTED_COLLECTION_NAME);
  }
  return collection;
}

// Return a dictionary word row, creating and translating one when necessary.
function getOrCreateDictionaryWord(db, statements, userId, language, token, targetNativeLanguage, fallbackTranslation) {
  // Reuse a matching user-owned word before creating an uncollected entry.
  const existing = statements.wordInLanguageBySurfaceOrLemma.get(userId, language.id, token.surface, token.lemma, token.surface);
  if (existing) {
    if (targetNativeLanguage && !hasUsableStoredTranslation(statements, existing.id, targetNativeLanguage, token) && !hasTranslationAttempt(statements, existing.id, targetNativeLanguage)) {
      statements.upsertWordTranslation.run(existing.id, targetNativeLanguage, fallbackTranslation);
    }
    return existing;
  }

  const collection = getUncollectedCollection(db, statements, userId, language.id);
  let word = statements.wordByCollectionAndLemma.get(collection.id, token.lemma);
  if (!word) {
    statements.insertWord.run(collection.id, token.lemma, fallbackTranslation, token.lemma);
    word = statements.wordByCollectionAndLemma.get(collection.id, token.lemma);
  }

  if (targetNativeLanguage) {
    statements.upsertWordTranslation.run(word.id, targetNativeLanguage, fallbackTranslation);
  }
  return word;
}

// Derive a readable material title from an uploaded filename.
function materialTitleFromFilename(filename) {
  return normalizeName(filename.replace(/\.[^.]+$/, "")) || "Untitled";
}

// Import a document, tokenize it, create missing words, and persist reader tokens.
export async function importMaterial(db, statements, userId, languageId, file) {
  const language = statements.languageById.get(Number(languageId), userId);
  if (!language) {
    return { error: "Language is required." };
  }
  if (!file?.buffer?.length) {
    return { error: "Upload a PDF, EPUB, or text file." };
  }

  const extracted = await extractTextFromUpload(file);
  const text = normalizeName(extracted.text);
  if (!text) {
    return { error: "No readable text was found in this file." };
  }

  const tokens = await tokenizeForLanguage(text, language.name);
  if (!tokens.length) {
    return { error: "No readable words were found in this file." };
  }
  const targetNativeLanguage = supportedTargetNativeLanguage(language, statements.userById.get(userId)?.nativeLanguage || "English");
  const translations = getTranslationCandidates(db, statements, userId, language, targetNativeLanguage, tokens);

  let materialId;
  db.exec("BEGIN");
  try {
    // Persist the material and token-to-word links atomically.
    const materialResult = statements.createMaterial.run(
      userId,
      language.id,
      materialTitleFromFilename(file.filename || "Untitled"),
      file.filename || "Untitled",
      extracted.fileType,
      text,
      tokens.length
    );
    materialId = Number(materialResult.lastInsertRowid);

    for (const token of tokens) {
      const word = getOrCreateDictionaryWord(db, statements, userId, language, token, targetNativeLanguage, translationForToken(db, language, targetNativeLanguage, token, translations));
      statements.insertMaterialToken.run(
        materialId,
        token.position,
        token.surface,
        token.normalized,
        token.lemma,
        token.pos,
        word.id,
        token.paragraphIndex,
        token.sentenceIndex
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  scheduleMaterialTranslationBackfill(db, statements, userId, materialId, targetNativeLanguage);

  return {
    material: statements.materialById.get(materialId, userId),
    tokenCount: tokens.length
  };
}

// Return a page of imported materials for one language.
export function getMaterials(db, statements, userId, languageId, offset = 0) {
  const nativeLanguage = statements.userById.get(userId)?.nativeLanguage || "English";
  return db.prepare(`
    SELECT id, title, file_name AS fileName, file_type AS fileType, word_count AS wordCount, created_at AS createdAt
    FROM materials
    WHERE user_id = ? AND language_id = ?
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT ? OFFSET ?
  `)
    .all(userId, Number(languageId), READER_WORK_PAGE_SIZE, Number(offset) || 0)
    .map((material) => ({
      ...material,
      translationStatus: materialTranslationStatus(db, material, nativeLanguage)
    }));
}

// Return material metadata and a bounded page of token rows for the reader.
export function getMaterialReader(db, statements, userId, materialId, start = 0, limit = 250) {
  const material = statements.materialById.get(Number(materialId), userId);
  if (!material) {
    return null;
  }
  const nativeLanguage = statements.userById.get(userId)?.nativeLanguage || "English";
  const translationStatus = materialTranslationStatus(db, material, nativeLanguage);
  if (!translationStatus.ready) {
    return { material, tokens: [], start: 0, limit: 0, nativeLanguage, translationStatus };
  }
  const safeLimit = Math.min(Math.max(Number(limit) || 250, 50), 1000);
  const safeStart = Math.max(Number(start) || 0, 0);
  const tokens = db.prepare(`
    SELECT mt.id, mt.position, mt.surface, mt.lemma, mt.pos, mt.word_id AS wordId,
           w.word AS dictionaryForm,
           CASE
             WHEN wt.translation IS NOT NULL AND trim(wt.translation) <> '' THEN wt.translation
             WHEN lower(?) = lower(?) THEN w.word
             WHEN ? = 'English' OR lower(?) = 'chinese' THEN w.translation
             ELSE ''
           END AS translation,
           COALESCE(uws.known, 0) AS known
    FROM material_tokens mt
    JOIN words w ON w.id = mt.word_id
    LEFT JOIN word_translations wt ON wt.word_id = w.id AND wt.native_language = ?
    LEFT JOIN user_word_status uws ON uws.word_id = w.id AND uws.user_id = ?
    WHERE mt.material_id = ?
    ORDER BY mt.position
    LIMIT ? OFFSET ?
  `).all(nativeLanguage, material.languageName, nativeLanguage, material.languageName, nativeLanguage, userId, material.id, safeLimit, safeStart);
  return { material, tokens, start: safeStart, limit: safeLimit, nativeLanguage, translationStatus };
}
