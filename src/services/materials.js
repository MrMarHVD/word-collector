import { NATIVE_LANGUAGE_OPTIONS, READER_WORK_PAGE_SIZE } from "../config.js";
import { normalizeName } from "../shared/normalize.js";
import { extractTextFromUpload } from "./textExtraction.js";
import { tokenizeForLanguage } from "./lemmatizer.js";
import { lookupEnglishJapanese, lookupJapaneseEnglish } from "./jmdict.js";

const UNCOLLECTED_COLLECTION_NAME = "Uncollected";

function getUncollectedCollection(db, statements, userId, languageId) {
  let collection = statements.collectionByName.get(userId, languageId, UNCOLLECTED_COLLECTION_NAME);
  if (!collection) {
    statements.createCollection.run(languageId, UNCOLLECTED_COLLECTION_NAME);
    collection = statements.collectionByName.get(userId, languageId, UNCOLLECTED_COLLECTION_NAME);
  }
  return collection;
}

function isJapaneseLanguage(language) {
  return language.name.toLowerCase() === "japanese" || language.name === "日本語";
}

function isEnglishLanguage(language) {
  return language.name.toLowerCase() === "english";
}

function targetNativeLanguageForStudyLanguage(language) {
  if (isJapaneseLanguage(language)) return "English";
  if (isEnglishLanguage(language)) return "Japanese";
  return "English";
}

function getStoredTranslation(statements, wordId, nativeLanguage) {
  return normalizeName(statements.wordTranslation.get(wordId, nativeLanguage)?.translation || "");
}

function hasUsableStoredTranslation(statements, wordId, nativeLanguage, token) {
  const stored = getStoredTranslation(statements, wordId, nativeLanguage);
  if (!stored) return false;
  return stored.toLowerCase() !== token.lemma.toLowerCase() && stored.toLowerCase() !== token.surface.toLowerCase();
}

function defaultTranslationForNativeLanguage(language, token, nativeLanguage, fallbackTranslation) {
  const targetNativeLanguage = targetNativeLanguageForStudyLanguage(language);
  if (nativeLanguage === targetNativeLanguage) {
    return fallbackTranslation;
  }
  if (nativeLanguage === "English" && isEnglishLanguage(language)) {
    return token.lemma;
  }
  if (nativeLanguage === "Japanese" && isJapaneseLanguage(language)) {
    return token.lemma;
  }
  return "";
}

function getOrCreateDictionaryWord(db, statements, userId, language, token, fallbackTranslation) {
  const targetNativeLanguage = targetNativeLanguageForStudyLanguage(language);
  const existing = statements.wordInLanguageBySurfaceOrLemma.get(userId, language.id, token.surface, token.lemma, token.surface);
  if (existing) {
    if (fallbackTranslation && !hasUsableStoredTranslation(statements, existing.id, targetNativeLanguage, token)) {
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

  for (const nativeLanguage of NATIVE_LANGUAGE_OPTIONS) {
    const translation = defaultTranslationForNativeLanguage(language, token, nativeLanguage, fallbackTranslation);
    statements.upsertWordTranslation.run(word.id, nativeLanguage, translation);
  }
  return word;
}

function getTranslationCandidates(db, statements, userId, language, tokens) {
  if (!isJapaneseLanguage(language) && !isEnglishLanguage(language)) {
    return new Map();
  }

  const candidates = new Map();
  for (const token of tokens) {
    const key = token.lemma.toLowerCase();
    if (candidates.has(key)) {
      continue;
    }
    const existing = statements.wordInLanguageBySurfaceOrLemma.get(userId, language.id, token.surface, token.lemma, token.surface);
    if (existing && hasUsableStoredTranslation(statements, existing.id, targetNativeLanguageForStudyLanguage(language), token)) {
      continue;
    }
    candidates.set(key, token.lemma);
  }

  return new Map(
    [...candidates.values()].map((lemma) => {
      const translation = isJapaneseLanguage(language) ? lookupJapaneseEnglish(db, lemma) : lookupEnglishJapanese(db, lemma);
      return [lemma.toLowerCase(), translation];
    })
  );
}

function materialTitleFromFilename(filename) {
  return normalizeName(filename.replace(/\.[^.]+$/, "")) || "Untitled";
}

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
  const englishTranslations = getTranslationCandidates(db, statements, userId, language, tokens);

  let materialId;
  db.exec("BEGIN");
  try {
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
      const word = getOrCreateDictionaryWord(db, statements, userId, language, token, englishTranslations.get(token.lemma.toLowerCase()) || "");
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

  return {
    material: statements.materialById.get(materialId, userId),
    tokenCount: tokens.length
  };
}

export function getMaterials(db, userId, languageId, offset = 0) {
  return db.prepare(`
    SELECT id, title, file_name AS fileName, file_type AS fileType, word_count AS wordCount, created_at AS createdAt
    FROM materials
    WHERE user_id = ? AND language_id = ?
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT ? OFFSET ?
  `).all(userId, Number(languageId), READER_WORK_PAGE_SIZE, Number(offset) || 0);
}

export function getMaterialReader(db, statements, userId, materialId, start = 0, limit = 250) {
  const material = statements.materialById.get(Number(materialId), userId);
  if (!material) {
    return null;
  }
  const nativeLanguage = statements.userById.get(userId)?.nativeLanguage || "English";
  const safeLimit = Math.min(Math.max(Number(limit) || 250, 50), 1000);
  const safeStart = Math.max(Number(start) || 0, 0);
  const tokens = db.prepare(`
    SELECT mt.id, mt.position, mt.surface, mt.lemma, mt.pos, mt.word_id AS wordId,
           w.word AS dictionaryForm,
           CASE
             WHEN wt.translation IS NOT NULL AND trim(wt.translation) <> '' THEN wt.translation
             WHEN ? = 'English' THEN w.translation
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
  `).all(nativeLanguage, nativeLanguage, userId, material.id, safeLimit, safeStart);
  return { material, tokens, start: safeStart, limit: safeLimit, nativeLanguage };
}
