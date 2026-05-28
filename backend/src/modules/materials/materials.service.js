import { Worker } from "node:worker_threads";
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

// Best-effort file type from the name, refined later by the extractor.
function fileTypeFromFilename(filename) {
  const lower = (filename || "").toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".epub")) return "epub";
  return "txt";
}

const IMPORT_MIME_TYPES = {
  pdf: "application/pdf",
  epub: "application/epub+zip",
  txt: "text/plain"
};

// Number of tokens persisted per transaction. Progress is committed between
// batches so the polling endpoint can report it while the worker keeps running.
const IMPORT_BATCH_SIZE = 200;

// Create the material row and hand the heavy work (extraction, tokenization,
// translation, token persistence) to a worker thread so the HTTP server stays
// responsive and the client can poll import progress. Returns immediately with
// the row in its 'processing' state.
export function startMaterialImport(repositories, userId, languageId, file) {
  const language = repositories.languages.findById(Number(languageId), userId);
  if (!language) {
    return { error: "Language is required." };
  }
  if (!file?.buffer?.length) {
    return { error: "Upload a PDF, EPUB, or text file." };
  }

  const fileName = file.filename || "Untitled";
  const fileType = fileTypeFromFilename(fileName);
  const created = repositories.materials.createProcessingMaterial(
    userId,
    language.id,
    materialTitleFromFilename(fileName),
    fileName,
    fileType
  );
  const materialId = Number(created.lastInsertRowid);

  // Copy the upload into a standalone ArrayBuffer so it can be transferred to
  // the worker without detaching Node's shared Buffer pool.
  const bytes = Uint8Array.from(file.buffer);
  const worker = new Worker(new URL("./materials.import.worker.js", import.meta.url), {
    workerData: { materialId, userId, languageId: language.id, fileName, fileBytes: bytes.buffer },
    transferList: [bytes.buffer]
  });
  let settled = false;
  worker.once("message", (message) => {
    settled = true;
    if (message?.error) {
      repositories.materials.markImportFailed(materialId, message.error);
    }
  });
  worker.once("error", (error) => {
    if (!settled) {
      repositories.materials.markImportFailed(materialId, error.message || "Import failed.");
    }
  });
  worker.once("exit", (code) => {
    if (!settled && code !== 0) {
      repositories.materials.markImportFailed(materialId, "Import worker stopped unexpectedly.");
    }
  });

  return { material: repositories.materials.findById(materialId, userId) };
}

// Extract, tokenize, and persist an imported document for an existing material
// row, updating progress as it goes. Runs inside the import worker thread.
export async function runMaterialImport(repositories, { materialId, userId, languageId, fileName, fileBytes }) {
  const language = repositories.languages.findById(Number(languageId), userId);
  if (!language) {
    throw new Error("Language is required.");
  }

  const file = {
    filename: fileName,
    type: IMPORT_MIME_TYPES[fileTypeFromFilename(fileName)],
    buffer: Buffer.from(fileBytes)
  };
  const extracted = await extractTextFromUpload(file);
  let text;
  let tokens;
  if (Array.isArray(extracted.blocks)) {
    if (!extracted.blocks.length) {
      throw new Error("No readable text was found in this file.");
    }
    // Joining with blank lines keeps the NOT NULL raw_text column populated
    // without collapsing the block boundaries that drive reader typography.
    text = extracted.blocks.map((block) => block.text).join("\n\n").trim();
    if (!text) {
      throw new Error("No readable text was found in this file.");
    }
    tokens = await tokenizeBlocksForLanguage(extracted.blocks, language.name);
  } else {
    text = normalizeName(extracted.text);
    if (!text) {
      throw new Error("No readable text was found in this file.");
    }
    tokens = await tokenizeForLanguage(text, language.name);
  }
  if (!tokens.length) {
    throw new Error("No readable words were found in this file.");
  }

  repositories.materials.updateImportMeta(materialId, text, tokens.length, extracted.fileType, tokens.length);

  const targetNativeLanguage = supportedTargetNativeLanguage(language, repositories.auth.findUserById(userId)?.nativeLanguage || "English");
  const translations = getTranslationCandidates(repositories, userId, language, targetNativeLanguage, tokens);

  for (let offset = 0; offset < tokens.length; offset += IMPORT_BATCH_SIZE) {
    const batch = tokens.slice(offset, offset + IMPORT_BATCH_SIZE);
    repositories.database.transaction(() => {
      for (const token of batch) {
        const word = getOrCreateDictionaryWord(repositories, userId, language, token, targetNativeLanguage, translationForToken(repositories, language, targetNativeLanguage, token, translations));
        repositories.materials.insertMaterialToken(materialId, token, word.id);
      }
    });
    repositories.materials.setImportProcessed(materialId, Math.min(offset + batch.length, tokens.length));
  }

  repositories.materials.markImportReady(materialId);

  // Backfill non-native languages after the work is openable so switching the
  // native language later stays fast. Failure here must not fail the import.
  try {
    backfillMaterialTranslations(repositories, userId, materialId, targetNativeLanguage);
  } catch (error) {
    console.error(`Translation backfill failed for material ${materialId}:`, error);
  }
}

// Return a page of imported materials for one language.
export function getMaterials(repositories, userId, languageId, offset = 0, search = "") {
  const nativeLanguage = repositories.auth.findUserById(userId)?.nativeLanguage || "English";
  return repositories.materials
    .listByUserAndLanguage(userId, Number(languageId), READER_WORK_PAGE_SIZE, Number(offset) || 0, search || "")
    .map((material) => {
      // While an import is still running the token set is incomplete, so the
      // translation status is meaningless; import progress drives the UI then.
      if (material.importStatus && material.importStatus !== "ready") {
        return { ...material, translationStatus: { targetLanguage: "", ready: false, totalWords: 0, completedWords: 0, missingWords: 0 } };
      }
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
  if (material.importStatus && material.importStatus !== "ready") {
    // The work is still importing (or failed); it cannot be read yet.
    const placeholder = { targetLanguage: "", ready: false, totalWords: 0, completedWords: 0, missingWords: 0 };
    return { material, tokens: [], start: 0, limit: 0, nativeLanguage, translationStatus: placeholder };
  }
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
