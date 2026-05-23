import { NATIVE_LANGUAGE_OPTIONS, READER_WORK_PAGE_SIZE } from "../config.js";
import { normalizeName } from "../shared/normalize.js";
import { extractTextFromUpload } from "./textExtraction.js";
import { tokenizeForLanguage } from "./lemmatizer.js";
import { lookupChineseEnglish, lookupChineseJapanese, lookupEnglishChinese, lookupEnglishJapanese, lookupJapaneseChinese, lookupJapaneseEnglish } from "./jmdict.js";

const UNCOLLECTED_COLLECTION_NAME = "Uncollected";
const SUPPORTED_TRANSLATION_LANGUAGES = ["English", "Japanese", "Chinese"];

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

// Detect Japanese study languages across English and Japanese labels.
function isJapaneseLanguage(language) {
  return language.name.toLowerCase() === "japanese" || language.name === "日本語";
}

// Detect English study languages.
function isEnglishLanguage(language) {
  return language.name.toLowerCase() === "english";
}

// Detect Chinese study languages.
function isChineseLanguage(language) {
  return language.name.toLowerCase() === "chinese";
}

function languageKey(language) {
  if (!language) return "";
  if (typeof language === "string") {
    const normalized = language.toLowerCase();
    if (normalized === "english") return "English";
    if (normalized === "japanese" || language === "日本語") return "Japanese";
    if (normalized === "chinese") return "Chinese";
    return "";
  }
  if (isEnglishLanguage(language)) return "English";
  if (isJapaneseLanguage(language)) return "Japanese";
  if (isChineseLanguage(language)) return "Chinese";
  return "";
}

const TRANSLATION_ROUTES = [
  { source: "English", target: "English", lookup: (_db, term) => term },
  { source: "English", target: "Japanese", lookup: lookupEnglishJapanese },
  { source: "English", target: "Chinese", lookup: lookupEnglishChinese },
  { source: "Japanese", target: "English", lookup: lookupJapaneseEnglish },
  { source: "Japanese", target: "Japanese", lookup: (_db, term) => term },
  { source: "Japanese", target: "Chinese", lookup: lookupJapaneseChinese },
  { source: "Chinese", target: "English", lookup: lookupChineseEnglish },
  { source: "Chinese", target: "Japanese", lookup: lookupChineseJapanese },
  { source: "Chinese", target: "Chinese", lookup: (_db, term) => term }
];

function translationRoute(sourceLanguage, targetLanguage) {
  const source = languageKey(sourceLanguage);
  const target = languageKey(targetLanguage);
  return TRANSLATION_ROUTES.find((route) => route.source === source && route.target === target) || null;
}

function lookupTranslation(db, language, targetNativeLanguage, term) {
  const route = translationRoute(language, targetNativeLanguage);
  return route ? normalizeName(route.lookup(db, term)) : "";
}

// Choose the native language that can be filled from local dictionaries.
function supportedTargetNativeLanguage(language, nativeLanguage) {
  if (translationRoute(language, nativeLanguage)) return nativeLanguage;
  if (translationRoute(language, "English")) return "English";
  return "";
}

// Return the stored translation for a word and native language.
function getStoredTranslation(statements, wordId, nativeLanguage) {
  return normalizeName(statements.wordTranslation.get(wordId, nativeLanguage)?.translation || "");
}

// Check whether a stored translation is meaningful for the selected token.
function hasUsableStoredTranslation(statements, wordId, nativeLanguage, token) {
  const stored = getStoredTranslation(statements, wordId, nativeLanguage);
  if (!stored) return false;
  return stored.toLowerCase() !== token.lemma.toLowerCase() && stored.toLowerCase() !== token.surface.toLowerCase();
}

// Produce default translation text for each native-language row.
function defaultTranslationForNativeLanguage(db, language, token, nativeLanguage, targetNativeLanguage, fallbackTranslation) {
  if (nativeLanguage === targetNativeLanguage) {
    return fallbackTranslation;
  }
  return lookupTranslation(db, language, nativeLanguage, token.lemma) || lookupTranslation(db, language, nativeLanguage, token.surface);
}

// Return a dictionary word row, creating and translating one when necessary.
function getOrCreateDictionaryWord(db, statements, userId, language, token, targetNativeLanguage, fallbackTranslation) {
  // Reuse a matching user-owned word before creating an uncollected entry.
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

  for (const nativeLanguage of new Set([...NATIVE_LANGUAGE_OPTIONS, targetNativeLanguage])) {
    const translation = defaultTranslationForNativeLanguage(db, language, token, nativeLanguage, targetNativeLanguage, fallbackTranslation);
    statements.upsertWordTranslation.run(word.id, nativeLanguage, translation);
  }
  return word;
}

// Build unique lemma translation candidates for tokens missing usable values.
function getTranslationCandidates(db, statements, userId, language, targetNativeLanguage, tokens) {
  if (!translationRoute(language, targetNativeLanguage)) {
    return new Map();
  }

  const candidates = new Map();
  for (const token of tokens) {
    const key = token.lemma.toLowerCase();
    if (candidates.has(key)) {
      continue;
    }
    const existing = statements.wordInLanguageBySurfaceOrLemma.get(userId, language.id, token.surface, token.lemma, token.surface);
    if (existing && hasUsableStoredTranslation(statements, existing.id, targetNativeLanguage, token)) {
      continue;
    }
    candidates.set(key, token.lemma);
  }

  return new Map(
    // Batch unique lemmas to avoid repeated local dictionary queries.
    [...candidates.values()].map((lemma) => {
      const translation = lookupTranslation(db, language, targetNativeLanguage, lemma);
      return [lemma.toLowerCase(), translation];
    })
  );
}

// Resolve the best translation for one token, falling back to surface lookup.
function translationForToken(db, language, targetNativeLanguage, token, translations) {
  const stored = translations.get(token.lemma.toLowerCase()) || "";
  if (stored) return stored;
  return lookupTranslation(db, language, targetNativeLanguage, token.surface);
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

  return {
    material: statements.materialById.get(materialId, userId),
    tokenCount: tokens.length
  };
}

// Return a page of imported materials for one language.
export function getMaterials(db, userId, languageId, offset = 0) {
  return db.prepare(`
    SELECT id, title, file_name AS fileName, file_type AS fileType, word_count AS wordCount, created_at AS createdAt
    FROM materials
    WHERE user_id = ? AND language_id = ?
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT ? OFFSET ?
  `).all(userId, Number(languageId), READER_WORK_PAGE_SIZE, Number(offset) || 0);
}

// Return material metadata and a bounded page of token rows for the reader.
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
  `).all(nativeLanguage, material.languageName, nativeLanguage, userId, material.id, safeLimit, safeStart);
  return { material, tokens, start: safeStart, limit: safeLimit, nativeLanguage };
}
