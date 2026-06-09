import { Worker } from "node:worker_threads";
import { BETA_MAX_MATERIALS_PER_USER, BETA_MAX_MATERIAL_UPLOAD_BYTES, READER_WORK_PAGE_SIZE } from "../../config.js";
import { normalizeName } from "../../shared/normalize.js";
import { lookupChineseDetails, lookupEnglishPos } from "../dictionaries/dictionaries.service.js";
import { backfillMaterialTranslations, displayTranslationForToken, getTranslationCandidates, hasTranslationAttempt, hasUsableStoredTranslation, languageKey, lookupTranslation, materialTranslationStatus, scheduleMaterialTranslationBackfill, supportedTargetNativeLanguage, translationDisambiguationCandidates, translationForToken } from "../translations/translations.service.js";
import { extractTextFromUpload } from "./text-extraction.service.js";
import { tokenizeBlocksForLanguage, tokenizeForLanguage } from "./tokenizer.service.js";

const UNCOLLECTED_COLLECTION_NAME = "Uncollected";

// Reader imports place auto-discovered words in a stable collection instead of
// requiring users to create one before importing material.
// Return the user's auto-created collection for imported reader words.
async function getUncollectedCollection(repositories, userId, languageId) {
  let collection = await repositories.words.findCollectionByName(userId, languageId, UNCOLLECTED_COLLECTION_NAME);
  if (!collection) {
    await repositories.words.createCollection(languageId, UNCOLLECTED_COLLECTION_NAME);
    collection = await repositories.words.findCollectionByName(userId, languageId, UNCOLLECTED_COLLECTION_NAME);
  }
  return collection;
}

// Resolve per-lemma metadata fields for the source language word row.
async function wordMetadataForToken(repositories, sourceLanguage, token) {
  const source = languageKey(sourceLanguage);
  if (source === "Japanese") {
    return { pos: token.pos || "", posSubcategory: token.posSubcategory || "", reading: token.reading || "", pinyin: "", traditional: "" };
  }
  if (source === "English") {
    const dictionaryPos = (await lookupEnglishPos(repositories.dictionaries, token.lemma)) || (await lookupEnglishPos(repositories.dictionaries, token.surface));
    return { pos: dictionaryPos || token.pos || "", posSubcategory: "", reading: "", pinyin: "", traditional: "" };
  }
  if (source === "Chinese") {
    const details = (await lookupChineseDetails(repositories.dictionaries, token.lemma)) || {};
    return { pos: "", posSubcategory: "", reading: "", pinyin: details.pinyin || "", traditional: details.traditional || "" };
  }
  return { pos: token.pos || "", posSubcategory: "", reading: "", pinyin: "", traditional: "" };
}

// Return a dictionary word row, creating and translating one when necessary.
async function getOrCreateDictionaryWord(repositories, userId, language, token, targetNativeLanguage, fallbackTranslation) {
  const metadata = await wordMetadataForToken(repositories, language, token);
  const source = languageKey(language);
  const baseTranslation = source === "English"
    ? token.lemma
    : (await lookupTranslation(repositories, language, "English", token.lemma)) || (await lookupTranslation(repositories, language, "English", token.surface)) || fallbackTranslation;
  // Reuse a matching user-owned word before creating an uncollected entry.
  const existing = await repositories.words.findWordInLanguageBySurfaceOrLemma(userId, language.id, token.surface, token.lemma);
  if (existing) {
    const attempted = targetNativeLanguage ? await hasTranslationAttempt(repositories, existing.id, targetNativeLanguage) : false;
    if (targetNativeLanguage && !(await hasUsableStoredTranslation(repositories, existing.id, targetNativeLanguage, token)) && (fallbackTranslation || !attempted)) {
      await repositories.translations.upsertWordTranslation(existing.id, targetNativeLanguage, fallbackTranslation);
    }
    await repositories.words.updateWordMetadata(existing.id, metadata);
    return existing;
  }

  const collection = await getUncollectedCollection(repositories, userId, language.id);
  let word = await repositories.words.findWordByCollectionAndLemma(collection.id, token.lemma);
  if (!word) {
    await repositories.words.insertWord(
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
    word = await repositories.words.findWordByCollectionAndLemma(collection.id, token.lemma);
  } else {
    await repositories.words.updateWordMetadata(word.id, metadata);
  }

  if (targetNativeLanguage) {
    await repositories.translations.upsertWordTranslation(word.id, targetNativeLanguage, fallbackTranslation);
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

function formatMegabytes(bytes) {
  return Math.round(bytes / 1024 / 1024);
}

// Create the material row and hand the heavy work (extraction, tokenization,
// translation, token persistence) to a worker thread so the HTTP server stays
// responsive and the client can poll import progress. Returns immediately with
// the row in its 'processing' state.
export async function startMaterialImport(repositories, userId, languageId, file) {
  const language = await repositories.languages.findById(Number(languageId), userId);
  if (!language) {
    return { error: "Language is required." };
  }
  if (!file?.buffer?.length) {
    return { error: "Upload a PDF, EPUB, or text file." };
  }
  if (file.buffer.length > BETA_MAX_MATERIAL_UPLOAD_BYTES) {
    const megabytes = formatMegabytes(BETA_MAX_MATERIAL_UPLOAD_BYTES);
    return {
      status: 413,
      error: `Documents can be no larger than ${megabytes} MB during beta.`,
      errorKey: "errors.materialFileTooLarge",
      details: { maxMegabytes: megabytes }
    };
  }
  const materialCount = await repositories.materials.countByUser(userId);
  if (materialCount >= BETA_MAX_MATERIALS_PER_USER) {
    return {
      status: 409,
      error: `You can keep up to ${BETA_MAX_MATERIALS_PER_USER} documents during beta. Delete one before uploading another.`,
      errorKey: "errors.materialLimitReached",
      details: { maxDocuments: BETA_MAX_MATERIALS_PER_USER }
    };
  }

  const fileName = file.filename || "Untitled";
  const fileType = fileTypeFromFilename(fileName);
  const created = await repositories.materials.createProcessingMaterial(
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
  // markImportFailed is async, so swallow its rejection here: these handlers run
  // detached from any awaiter and an unhandled rejection would crash the process.
  const failImport = (reason) => {
    repositories.materials.markImportFailed(materialId, reason).catch((error) => {
      console.error(`Failed to mark material ${materialId} import as failed:`, error);
    });
  };
  let settled = false;
  worker.once("message", (message) => {
    settled = true;
    if (message?.error) {
      failImport(message.error);
    }
  });
  worker.once("error", (error) => {
    if (!settled) {
      failImport(error.message || "Import failed.");
    }
  });
  worker.once("exit", (code) => {
    if (!settled && code !== 0) {
      failImport("Import worker stopped unexpectedly.");
    }
  });

  return { material: await repositories.materials.findById(materialId, userId) };
}

// Extract, tokenize, and persist an imported document for an existing material
// row, updating progress as it goes. Runs inside the import worker thread.
export async function runMaterialImport(repositories, { materialId, userId, languageId, fileName, fileBytes }) {
  const language = await repositories.languages.findById(Number(languageId), userId);
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

  await repositories.materials.updateImportMeta(materialId, text, tokens.length, extracted.fileType, tokens.length);

  const targetNativeLanguage = supportedTargetNativeLanguage(language, (await repositories.auth.findUserById(userId))?.nativeLanguage || "English");
  const translations = await getTranslationCandidates(repositories, userId, language, targetNativeLanguage, tokens);

  for (let offset = 0; offset < tokens.length; offset += IMPORT_BATCH_SIZE) {
    const batch = tokens.slice(offset, offset + IMPORT_BATCH_SIZE);
    await repositories.database.transaction(async (tx) => {
      for (const token of batch) {
        const fallback = await translationForToken(tx, language, targetNativeLanguage, token, translations);
        const word = await getOrCreateDictionaryWord(tx, userId, language, token, targetNativeLanguage, fallback);
        await tx.materials.insertMaterialToken(materialId, token, word.id);
      }
    });
    await repositories.materials.setImportProcessed(materialId, Math.min(offset + batch.length, tokens.length));
  }

  await repositories.materials.markImportReady(materialId);

  // Backfill non-native languages after the work is openable so switching the
  // native language later stays fast. Failure here must not fail the import.
  try {
    await backfillMaterialTranslations(repositories, userId, materialId, targetNativeLanguage);
  } catch (error) {
    console.error(`Translation backfill failed for material ${materialId}:`, error);
  }
}

// Return a page of imported materials for one language.
export async function getMaterials(repositories, userId, languageId, offset = 0, search = "") {
  const nativeLanguage = (await repositories.auth.findUserById(userId))?.nativeLanguage || "English";
  const materials = await repositories.materials.listByUserAndLanguage(userId, Number(languageId), READER_WORK_PAGE_SIZE, Number(offset) || 0, search || "");
  const result = [];
  for (const material of materials) {
    // While an import is still running the token set is incomplete, so the
    // translation status is meaningless; import progress drives the UI then.
    if (material.importStatus && material.importStatus !== "ready") {
      result.push({ ...material, translationStatus: { targetLanguage: "", ready: false, totalWords: 0, completedWords: 0, missingWords: 0 } });
      continue;
    }
    const translationStatus = await materialTranslationStatus(repositories, material, nativeLanguage);
    if (!translationStatus.ready) {
      scheduleMaterialTranslationBackfill(repositories, userId, material.id, "");
    }
    result.push({ ...material, translationStatus });
  }
  return result;
}

// Return material metadata and a bounded page of token rows for the reader.
export async function getMaterialReader(repositories, userId, materialId, start = 0, limit = 250) {
  const material = await repositories.materials.findById(Number(materialId), userId);
  if (!material) {
    return null;
  }
  const nativeLanguage = (await repositories.auth.findUserById(userId))?.nativeLanguage || "English";
  if (material.importStatus && material.importStatus !== "ready") {
    // The work is still importing (or failed); it cannot be read yet.
    const placeholder = { targetLanguage: "", ready: false, totalWords: 0, completedWords: 0, missingWords: 0 };
    return { material, tokens: [], start: 0, limit: 0, nativeLanguage, translationStatus: placeholder };
  }
  const translationStatus = await materialTranslationStatus(repositories, material, nativeLanguage);
  if (!translationStatus.ready) {
    scheduleMaterialTranslationBackfill(repositories, userId, material.id, "");
    return { material, tokens: [], start: 0, limit: 0, nativeLanguage, translationStatus };
  }
  const safeLimit = Math.min(Math.max(Number(limit) || 250, 50), 1000);
  const requestedStart = start === null || start === undefined ? material.readerStart : start;
  const safeStart = Math.min(Math.max(Number(requestedStart) || 0, 0), Math.max(Number(material.wordCount || 0) - 1, 0));
  const sourceLanguage = { id: material.languageId, name: material.languageName };
  const rawTokens = await repositories.materials.listReaderTokens(material, nativeLanguage, safeLimit, safeStart, userId);
  const tokens = [];
  for (const token of rawTokens) {
    const disambiguationCandidates = await translationDisambiguationCandidates(repositories, sourceLanguage, nativeLanguage, token);
    if (!disambiguationCandidates.length) {
      tokens.push(token);
      continue;
    }
    tokens.push({
      ...token,
      translation: (await displayTranslationForToken(repositories, sourceLanguage, nativeLanguage, token)) || token.translation,
      disambiguationCandidates
    });
  }
  return { material, tokens, start: safeStart, limit: safeLimit, nativeLanguage, translationStatus };
}

export async function updateMaterialReaderStart(repositories, userId, materialId, start = 0) {
  const material = await repositories.materials.findById(Number(materialId), userId);
  if (!material) {
    return null;
  }
  const safeStart = Math.min(Math.max(Number(start) || 0, 0), Math.max(Number(material.wordCount || 0) - 1, 0));
  await repositories.materials.updateReaderStart(safeStart, material.id, userId);
  return repositories.materials.findById(material.id, userId);
}
