import { READER_WORK_PAGE_SIZE } from "../../config.js";
import { normalizeName } from "../../shared/normalize.js";
import { lookupChineseDetails, lookupEnglishPos } from "../dictionaries/dictionaries.service.js";
import { displayTranslationForToken, getTranslationCandidates, hasTranslationAttempt, hasUsableStoredTranslation, languageKey, lookupTranslation, materialTranslationStatus, scheduleMaterialTranslationBackfill, supportedTargetNativeLanguage, translationDisambiguationCandidates, translationForToken } from "../translations/translations.service.js";
import { extractTextFromUpload } from "./text-extraction.service.js";
import { tokenizeBlocksForLanguage, tokenizeForLanguage } from "./tokenizer.service.js";

const UNCOLLECTED_COLLECTION_NAME = "Uncollected";

// Reader imports place auto-discovered words in a stable collection instead of
// requiring users to create one before importing material.
// Return the user's auto-created collection for imported reader words.
function getUncollectedCollection(repositories, userId, languageId) {
  let collection = repositories.words.findCollectionByName(userId, languageId, UNCOLLECTED_COLLECTION_NAME);
  if (!collection) {
    repositories.words.createCollection(languageId, UNCOLLECTED_COLLECTION_NAME);
    collection = repositories.words.findCollectionByName(userId, languageId, UNCOLLECTED_COLLECTION_NAME);
  }
  return collection;
}

// Resolve per-lemma metadata fields for the source language word row.
function wordMetadataForToken(repositories, sourceLanguage, token) {
  const source = languageKey(sourceLanguage);
  if (source === "Japanese") {
    return { pos: token.pos || "", posSubcategory: token.posSubcategory || "", reading: token.reading || "", pinyin: "", traditional: "" };
  }
  if (source === "English") {
    const dictionaryPos = lookupEnglishPos(repositories.dictionaries, token.lemma) || lookupEnglishPos(repositories.dictionaries, token.surface);
    return { pos: dictionaryPos || token.pos || "", posSubcategory: "", reading: "", pinyin: "", traditional: "" };
  }
  if (source === "Chinese") {
    const details = lookupChineseDetails(repositories.dictionaries, token.lemma) || {};
    return { pos: "", posSubcategory: "", reading: "", pinyin: details.pinyin || "", traditional: details.traditional || "" };
  }
  return { pos: token.pos || "", posSubcategory: "", reading: "", pinyin: "", traditional: "" };
}

// Return a dictionary word row, creating and translating one when necessary.
function getOrCreateDictionaryWord(repositories, userId, language, token, targetNativeLanguage, fallbackTranslation) {
  const metadata = wordMetadataForToken(repositories, language, token);
  const source = languageKey(language);
  const baseTranslation = source === "English"
    ? token.lemma
    : lookupTranslation(repositories, language, "English", token.lemma) || lookupTranslation(repositories, language, "English", token.surface) || fallbackTranslation;
  // Reuse a matching user-owned word before creating an uncollected entry.
  const existing = repositories.words.findWordInLanguageBySurfaceOrLemma(userId, language.id, token.surface, token.lemma);
  if (existing) {
    const attempted = targetNativeLanguage ? hasTranslationAttempt(repositories, existing.id, targetNativeLanguage) : false;
    if (targetNativeLanguage && !hasUsableStoredTranslation(repositories, existing.id, targetNativeLanguage, token) && (fallbackTranslation || !attempted)) {
      repositories.translations.upsertWordTranslation(existing.id, targetNativeLanguage, fallbackTranslation);
    }
    repositories.words.updateWordMetadata(existing.id, metadata);
    return existing;
  }

  const collection = getUncollectedCollection(repositories, userId, language.id);
  let word = repositories.words.findWordByCollectionAndLemma(collection.id, token.lemma);
  if (!word) {
    repositories.words.insertWord(
      collection.id,
      token.lemma,
      baseTranslation,
      token.lemma,
      metadata.pos || null,
      metadata.posSubcategory || null,
      metadata.reading || null,
      metadata.pinyin || null,
      metadata.traditional || null
    );
    word = repositories.words.findWordByCollectionAndLemma(collection.id, token.lemma);
  } else {
    repositories.words.updateWordMetadata(word.id, metadata);
  }

  if (targetNativeLanguage) {
    repositories.translations.upsertWordTranslation(word.id, targetNativeLanguage, fallbackTranslation);
  }
  return word;
}

// Derive a readable material title from an uploaded filename.
function materialTitleFromFilename(filename) {
  return normalizeName(filename.replace(/\.[^.]+$/, "")) || "Untitled";
}

// Import a document, tokenize it, create missing words, and persist reader tokens.
export async function importMaterial(repositories, userId, languageId, file) {
  const language = repositories.languages.findById(Number(languageId), userId);
  if (!language) {
    return { error: "Language is required." };
  }
  if (!file?.buffer?.length) {
    return { error: "Upload a PDF, EPUB, or text file." };
  }

  const extracted = await extractTextFromUpload(file);
  let text;
  let tokens;
  if (Array.isArray(extracted.blocks)) {
    if (!extracted.blocks.length) {
      return { error: "No readable text was found in this file." };
    }
    // Joining with blank lines keeps the NOT NULL raw_text column populated
    // without collapsing the block boundaries that drive reader typography.
    text = extracted.blocks.map((block) => block.text).join("\n\n").trim();
    if (!text) {
      return { error: "No readable text was found in this file." };
    }
    tokens = await tokenizeBlocksForLanguage(extracted.blocks, language.name);
  } else {
    text = normalizeName(extracted.text);
    if (!text) {
      return { error: "No readable text was found in this file." };
    }
    tokens = await tokenizeForLanguage(text, language.name);
  }
  if (!tokens.length) {
    return { error: "No readable words were found in this file." };
  }
  const targetNativeLanguage = supportedTargetNativeLanguage(language, repositories.auth.findUserById(userId)?.nativeLanguage || "English");
  const translations = getTranslationCandidates(repositories, userId, language, targetNativeLanguage, tokens);

  let materialId;
  repositories.database.transaction(() => {
    // Persist the material and token-to-word links atomically.
    const materialResult = repositories.materials.createMaterial(
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
      const word = getOrCreateDictionaryWord(repositories, userId, language, token, targetNativeLanguage, translationForToken(repositories, language, targetNativeLanguage, token, translations));
      repositories.materials.insertMaterialToken(materialId, token, word.id);
    }
  });

  scheduleMaterialTranslationBackfill(repositories, userId, materialId, targetNativeLanguage);

  return {
    material: repositories.materials.findById(materialId, userId),
    tokenCount: tokens.length
  };
}

// Return a page of imported materials for one language.
export function getMaterials(repositories, userId, languageId, offset = 0, search = "") {
  const nativeLanguage = repositories.auth.findUserById(userId)?.nativeLanguage || "English";
  return repositories.materials
    .listByUserAndLanguage(userId, Number(languageId), READER_WORK_PAGE_SIZE, Number(offset) || 0, search || "")
    .map((material) => {
      const translationStatus = materialTranslationStatus(repositories, material, nativeLanguage);
      if (!translationStatus.ready) {
        scheduleMaterialTranslationBackfill(repositories, userId, material.id, "");
      }
      return {
        ...material,
        translationStatus
      };
    });
}

// Return material metadata and a bounded page of token rows for the reader.
export function getMaterialReader(repositories, userId, materialId, start = 0, limit = 250) {
  const material = repositories.materials.findById(Number(materialId), userId);
  if (!material) {
    return null;
  }
  const nativeLanguage = repositories.auth.findUserById(userId)?.nativeLanguage || "English";
  const translationStatus = materialTranslationStatus(repositories, material, nativeLanguage);
  if (!translationStatus.ready) {
    scheduleMaterialTranslationBackfill(repositories, userId, material.id, "");
    return { material, tokens: [], start: 0, limit: 0, nativeLanguage, translationStatus };
  }
  const safeLimit = Math.min(Math.max(Number(limit) || 250, 50), 1000);
  const requestedStart = start === null || start === undefined ? material.readerStart : start;
  const safeStart = Math.min(Math.max(Number(requestedStart) || 0, 0), Math.max(Number(material.wordCount || 0) - 1, 0));
  const sourceLanguage = { id: material.languageId, name: material.languageName };
  const tokens = repositories.materials.listReaderTokens(material, nativeLanguage, safeLimit, safeStart, userId).map((token) => {
    const disambiguationCandidates = translationDisambiguationCandidates(repositories, sourceLanguage, nativeLanguage, token);
    if (!disambiguationCandidates.length) {
      return token;
    }
    return {
      ...token,
      translation: displayTranslationForToken(repositories, sourceLanguage, nativeLanguage, token) || token.translation,
      disambiguationCandidates
    };
  });
  return { material, tokens, start: safeStart, limit: safeLimit, nativeLanguage, translationStatus };
}

export function updateMaterialReaderStart(repositories, userId, materialId, start = 0) {
  const material = repositories.materials.findById(Number(materialId), userId);
  if (!material) {
    return null;
  }
  const safeStart = Math.min(Math.max(Number(start) || 0, 0), Math.max(Number(material.wordCount || 0) - 1, 0));
  repositories.materials.updateReaderStart(safeStart, material.id, userId);
  return repositories.materials.findById(material.id, userId);
}
