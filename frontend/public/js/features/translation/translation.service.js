/**
 * @fileoverview On-device Japanese-to-English translation service.
 *
 * Wraps the vendored Bergamot engine (`/vendor/bergamot-0.4.9/`) behind a single
 * promise-based `translate()` call. Nothing is loaded at import time: the first
 * call imports the engine, starts its worker and downloads the model files,
 * reporting progress through `onStatus`. The engine instance is then reused for
 * every later call. Model files are persisted in the Cache API because WebKit's
 * HTTP cache does not keep the largest one; when Cache Storage is unavailable
 * the network (and HTTP cache) is used instead. Once the model is handed to the
 * engine worker, this module drops its copy so the buffers can be collected.
 *
 * Only the most recent call is ever answered: issuing a new call rejects the
 * still-pending previous one with a `"superseded"` error.
 */

const ENGINE_URL = "/vendor/bergamot-0.4.9/translator.js";
const MODEL_FILES = {
  model: { url: "/models/ja-en-2.1/model.bin", size: 43977787 },
  lex: { url: "/models/ja-en-2.1/lex.bin", size: 9348172 },
  vocab: { url: "/models/ja-en-2.1/vocab.spm", size: 1443222 }
};
// Versioned by model path; a new model version gets a new cache.
const MODEL_CACHE_NAME = "translation-models:/models/ja-en-2.1/";
// Minimum interval between forwarded download-progress callbacks.
const PROGRESS_INTERVAL_MS = 100;
const SOURCE_LANGUAGE = "ja";
const TARGET_LANGUAGE = "en";
// Smallest module using a SIMD instruction; the engine's WASM build requires SIMD.
const SIMD_TEST_MODULE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11
]);

/** @type {Promise<object> | null} Initialised `LatencyOptimisedTranslator`, shared across calls. */
let translatorPromise = null;
/** @type {Promise<object> | null} Model buffers in bergamot-translator format, until the engine takes them. */
let modelPromise = null;
/** Whether the engine and model have both finished loading at least once. */
let loaded = false;
/** Latest model download progress, replayed to calls that join a download in flight. */
let modelProgress = { loaded: 0, total: null };
/** Time the last download-progress callback was forwarded, for throttling. */
let lastProgressAt = -Infinity;
/** @type {{ onStatus?: Function, loading: boolean, settled: boolean, fail: (error: Error) => void } | null} */
let activeCall = null;

/**
 * Error raised by `translate()`.
 *
 * `code` is one of `"unsupported"`, `"model-unavailable"`, `"failed"` or
 * `"superseded"`. Callers silently ignore `"superseded"`.
 */
export class TranslationError extends Error {
  /**
   * @param {"unsupported"|"model-unavailable"|"failed"|"superseded"} code - Failure category.
   * @param {string} message - Developer-facing description.
   * @param {{ cause?: unknown }} [options] - Optional underlying error.
   */
  constructor(code, message, options) {
    super(message, options);
    this.name = "TranslationError";
    this.code = code;
  }
}

/**
 * Translate Japanese text to English on-device.
 *
 * Status sequence: `"loading-model"` (only while the engine or model is still
 * loading, possibly repeated with download progress), then `"translating"`,
 * then `"ready"`.
 *
 * @param {string} text - Japanese source text.
 * @param {{ onStatus?: (status: "loading-model"|"translating"|"ready", info?: { loaded: number, total: number|null }) => void }} [options]
 * @returns {Promise<{ sourceText: string, targetText: string, alignments: null }>}
 * @throws {TranslationError} Via rejection; see `TranslationError` for codes.
 */
export function translate(text, options = {}) {
  activeCall?.fail(new TranslationError("superseded", "Replaced by a newer translation request."));

  return new Promise((resolve, reject) => {
    const call = { onStatus: options.onStatus, loading: false, settled: false };
    const settle = (callback, value) => {
      if (call.settled) return;
      call.settled = true;
      if (activeCall === call) activeCall = null;
      callback(value);
    };
    call.fail = (error) => settle(reject, error);
    activeCall = call;

    runTranslation(text, call).then(
      (result) => settle(resolve, result),
      (error) => settle(reject, toTranslationError(error))
    );
  });
}

/**
 * Load the engine and model if needed, then translate `text` for `call`.
 *
 * @param {string} text - Japanese source text.
 * @param {object} call - Call record created by `translate()`.
 * @returns {Promise<{ sourceText: string, targetText: string, alignments: null }>}
 */
async function runTranslation(text, call) {
  if (!isSupported()) {
    throw new TranslationError("unsupported", "WebAssembly SIMD and Web Workers are required.");
  }

  if (!loaded) {
    call.loading = true;
    reportStatus(call, "loading-model", { ...modelProgress });
    await Promise.all([loadTranslator(), loadModel()]);
    loaded = true;
    call.loading = false;
  }

  // A newer call took over while this one waited for loading.
  if (call.settled) return null;

  reportStatus(call, "translating");
  const translator = await loadTranslator();
  const response = await translator.translate({
    from: SOURCE_LANGUAGE,
    to: TARGET_LANGUAGE,
    text,
    html: false
  });
  reportStatus(call, "ready");
  return { sourceText: text, targetText: response.target.text, alignments: null };
}

/**
 * Check for Web Worker and WebAssembly SIMD support.
 *
 * @returns {boolean} True when the engine can run in this browser.
 */
function isSupported() {
  try {
    return typeof Worker === "function" && WebAssembly.validate(SIMD_TEST_MODULE);
  } catch {
    return false;
  }
}

/**
 * Import the engine and start its worker once; later calls reuse the instance.
 * A failed start is not cached, so the next call retries.
 *
 * @returns {Promise<object>} Initialised `LatencyOptimisedTranslator`.
 */
function loadTranslator() {
  translatorPromise ??= startTranslator().catch((error) => {
    translatorPromise = null;
    throw error;
  });
  return translatorPromise;
}

/**
 * Import the engine module, create the translator and wait for its worker.
 *
 * @returns {Promise<object>} Initialised `LatencyOptimisedTranslator`.
 */
async function startTranslator() {
  const { LatencyOptimisedTranslator, TranslatorBacking } = await import(ENGINE_URL);

  /**
   * Backing that serves the self-hosted model instead of the remote registry.
   * It keeps no buffer cache: the engine only asks for the model when its
   * single worker lacks it, and a crashed worker gets a new backing.
   */
  class LocalModelBacking extends TranslatorBacking {
    async loadModelRegistery() {
      return [{ from: SOURCE_LANGUAGE, to: TARGET_LANGUAGE, files: {} }];
    }

    getTranslationModel(pair, options) {
      return this.loadTranslationModel(pair, options);
    }

    async loadTranslationModel() {
      const model = await loadModel();
      // The worker copies the buffers, so release ours for garbage collection.
      modelPromise = null;
      return model;
    }
  }

  let failStart;
  const startFailed = new Promise((_, reject) => {
    failStart = reject;
  });
  const backing = new LocalModelBacking({ pivotLanguage: null });
  // Must be set before the translator is created: its worker binds it on creation.
  // Worker crashes never settle the engine's own promises, so fail the active
  // call here and discard the instance so the next call starts a fresh one.
  backing.onerror = (error) => {
    failStart(error);
    if (translatorPromise === pending) {
      translatorPromise = null;
      loaded = false;
      translator.delete().catch(() => {});
    }
    activeCall?.fail(toTranslationError(error));
  };
  const translator = new LatencyOptimisedTranslator({ pivotLanguage: null }, backing);
  const pending = translatorPromise;
  await Promise.race([translator.worker, startFailed]);
  return translator;
}

/**
 * Download the model files once; later calls reuse the buffers. A failed
 * download is not cached, so the next call retries.
 *
 * @returns {Promise<{ model: ArrayBuffer, shortlist: ArrayBuffer, vocabs: ArrayBuffer[], config: object }>}
 * @throws {TranslationError} `"model-unavailable"` on a non-2xx response or network error.
 */
function loadModel() {
  modelPromise ??= downloadModel().catch((error) => {
    modelPromise = null;
    throw error;
  });
  return modelPromise;
}

/**
 * Load all model files in parallel from Cache Storage or the network,
 * reporting combined byte progress.
 *
 * @returns {Promise<{ model: ArrayBuffer, shortlist: ArrayBuffer, vocabs: ArrayBuffer[], config: object }>}
 * @throws {TranslationError} `"model-unavailable"` on a non-2xx response or network error.
 */
async function downloadModel() {
  try {
    const parts = Object.keys(MODEL_FILES);
    const sources = await Promise.all(parts.map((part) => openModelFile(MODEL_FILES[part])));
    const sizes = sources.map((source) => source.size);
    const progress = { loaded: 0, total: sizes.includes(null) ? null : sizes.reduce((sum, size) => sum + size, 0) };
    reportModelProgress(progress);

    const buffers = await Promise.all(
      sources.map((source) =>
        source.read((byteCount) => {
          progress.loaded += byteCount;
          reportModelProgress(progress);
        })
      )
    );
    reportModelProgress(progress, true);
    const files = Object.fromEntries(parts.map((part, index) => [part, buffers[index]]));
    return { model: files.model, shortlist: files.lex, vocabs: [files.vocab], config: {} };
  } catch (error) {
    throw new TranslationError("model-unavailable", "Could not download the translation model.", { cause: error });
  }
}

/**
 * Open one model file from Cache Storage, falling back to the network. A
 * network download is stored in the cache once read in full.
 *
 * @param {{ url: string, size: number }} file - Model file URL and expected byte length.
 * @returns {Promise<{ size: number|null, read: (onChunk: (byteCount: number) => void) => Promise<ArrayBuffer> }>}
 *   Byte length if known, and a reader for the contents.
 * @throws {Error} On a network error or non-2xx status.
 */
async function openModelFile(file) {
  const cached = await readCachedModelFile(file);
  if (cached) {
    return {
      size: cached.byteLength,
      read: async (onChunk) => {
        onChunk(cached.byteLength);
        return cached;
      }
    };
  }

  const response = await fetchModelFile(file.url);
  return {
    size: Number(response.headers.get("content-length")) || null,
    read: async (onChunk) => {
      const buffer = await readBody(response, onChunk);
      storeCachedModelFile(file, buffer);
      return buffer;
    }
  };
}

/**
 * Read a model file from Cache Storage. An entry of the wrong length is
 * deleted so it is fetched again. Cache errors are treated as a miss.
 *
 * @param {{ url: string, size: number }} file - Model file URL and expected byte length.
 * @returns {Promise<ArrayBuffer | null>} Cached contents, or null on a miss.
 */
async function readCachedModelFile(file) {
  try {
    if (typeof caches === "undefined") return null;
    const cache = await caches.open(MODEL_CACHE_NAME);
    const response = await cache.match(file.url);
    if (!response) return null;
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === file.size) return buffer;
    await cache.delete(file.url);
    return null;
  } catch {
    return null;
  }
}

/**
 * Store a fully downloaded model file in Cache Storage, in the background.
 * Files of an unexpected length are not stored; storage errors (private mode,
 * quota) are ignored because the network remains available.
 *
 * @param {{ url: string, size: number }} file - Model file URL and expected byte length.
 * @param {ArrayBuffer} buffer - Downloaded contents.
 * @returns {void}
 */
function storeCachedModelFile(file, buffer) {
  if (typeof caches === "undefined" || buffer.byteLength !== file.size) return;
  caches
    .open(MODEL_CACHE_NAME)
    .then((cache) => cache.put(file.url, new Response(buffer, { headers: { "content-type": "application/octet-stream" } })))
    .catch(() => {});
}

/**
 * Fetch one model file and reject on a non-2xx status.
 *
 * @param {string} url - Model file URL.
 * @returns {Promise<Response>} Response whose body has not been read yet.
 * @throws {Error} On a network error or non-2xx status.
 */
async function fetchModelFile(url) {
  const response = await fetch(url, { credentials: "omit" });
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`);
  }
  return response;
}

/**
 * Read a response body as a stream, reporting each chunk's size.
 *
 * @param {Response} response - Response with an unread body.
 * @param {(byteCount: number) => void} onChunk - Called with the size of each chunk.
 * @returns {Promise<ArrayBuffer>} The complete body.
 */
async function readBody(response, onChunk) {
  if (!response.body) {
    const buffer = await response.arrayBuffer();
    onChunk(buffer.byteLength);
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    length += value.byteLength;
    onChunk(value.byteLength);
  }

  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}

/**
 * Record download progress and forward it to the active call while it is
 * loading, at most once per `PROGRESS_INTERVAL_MS` unless `final` is set.
 *
 * @param {{ loaded: number, total: number|null }} progress - Combined progress so far.
 * @param {boolean} [final] - Forward regardless of throttling (download complete).
 * @returns {void}
 */
function reportModelProgress(progress, final = false) {
  modelProgress = { ...progress };
  const now = performance.now();
  if (!final && now - lastProgressAt < PROGRESS_INTERVAL_MS) return;
  lastProgressAt = now;
  if (activeCall?.loading) {
    reportStatus(activeCall, "loading-model", { ...progress });
  }
}

/**
 * Invoke a call's `onStatus` callback unless the call has already settled.
 *
 * @param {object} call - Call record created by `translate()`.
 * @param {"loading-model"|"translating"|"ready"} status - New status.
 * @param {{ loaded: number, total: number|null }} [info] - Download progress, for `"loading-model"`.
 * @returns {void}
 */
function reportStatus(call, status, info) {
  if (call.settled || !call.onStatus) return;
  if (info) {
    call.onStatus(status, info);
  } else {
    call.onStatus(status);
  }
}

/**
 * Map any error to a `TranslationError`, keeping existing codes.
 *
 * @param {unknown} error - Error thrown by loading or translation.
 * @returns {TranslationError}
 */
function toTranslationError(error) {
  if (error instanceof TranslationError) return error;
  if (error?.constructor?.name === "SupersededError") {
    return new TranslationError("superseded", "Replaced by a newer translation request.", { cause: error });
  }
  return new TranslationError("failed", "Translation failed.", { cause: error });
}
