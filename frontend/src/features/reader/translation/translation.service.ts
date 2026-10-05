/**
 * @fileoverview On-device Japanese- and Chinese-to-English translation service.
 *
 * Wraps the vendored Bergamot engine (`/vendor/bergamot-0.4.9/`) behind a single
 * promise-based `translate()` call. Nothing is loaded at import time: the first
 * call imports the engine, starts its worker and downloads the model files,
 * reporting progress through `onStatus`. The engine instance is then reused for
 * every later call. Each source language has its own model (see
 * `translation-models.ts`) and its own engine instance, loaded on first use.
 * Model files are persisted in the Cache API because WebKit's
 * HTTP cache does not keep the largest one; when Cache Storage is unavailable
 * the network (and HTTP cache) is used instead. Once the model is handed to the
 * engine worker, this module drops its copy so the buffers can be collected.
 *
 * Only the most recent call is ever answered: issuing a new call rejects the
 * still-pending previous one with a `"superseded"` error.
 *
 * Copied unchanged from public/js/features/translation/translation.service.js,
 * apart from the TypeScript typing and the engine import (see startTranslator).
 */

import { TARGET_LANGUAGE, translationModelFor, type ModelFile, type TranslationModelSpec } from "./translation-models";

const ENGINE_URL = "/vendor/bergamot-0.4.9/translator.js";
// Minimum interval between forwarded download-progress callbacks.
const PROGRESS_INTERVAL_MS = 100;
// Smallest module using a SIMD instruction; the engine's WASM build requires SIMD.
const SIMD_TEST_MODULE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);

export type TranslationErrorCode = "unsupported" | "model-unavailable" | "failed" | "superseded";
export type TranslationStatus = "loading-model" | "translating" | "ready";

/** Combined model download progress; `total` is null when a size is unknown. */
export interface TranslationProgress {
  loaded: number;
  total: number | null;
}

export interface TranslateOptions {
  /** Material language name to translate from (case-insensitive); defaults to Japanese. */
  sourceLanguage?: string;
  onStatus?: (status: TranslationStatus, info?: TranslationProgress) => void;
}

export interface TranslationResult {
  sourceText: string;
  targetText: string;
  alignments: null;
}

/** Model buffers in bergamot-translator format. */
interface TranslationModel {
  model: ArrayBuffer;
  shortlist: ArrayBuffer;
  vocabs: ArrayBuffer[];
  config: object;
}

/** The parts of the engine's `LatencyOptimisedTranslator` this module uses. */
interface Translator {
  worker: Promise<unknown>;
  translate(request: { from: string; to: string; text: string; html: boolean }): Promise<{ target: { text: string } }>;
  delete(): Promise<void>;
}

/** The parts of the engine's `TranslatorBacking` this module overrides. */
interface TranslatorBacking {
  onerror: (error: unknown) => void;
}

interface EngineModule {
  LatencyOptimisedTranslator: new (options: { pivotLanguage: null }, backing: TranslatorBacking) => Translator;
  TranslatorBacking: new (options: { pivotLanguage: null }) => TranslatorBacking;
}

/** Engine and model state of one source language. */
interface LanguageState {
  spec: TranslationModelSpec;
  /** Initialised `LatencyOptimisedTranslator`, shared across calls. */
  translatorPromise: Promise<Translator> | null;
  /** Model buffers in bergamot-translator format, until the engine takes them. */
  modelPromise: Promise<TranslationModel> | null;
  /** Whether the engine and model have both finished loading at least once. */
  loaded: boolean;
  /** Latest model download progress, replayed to calls that join a download in flight. */
  progress: TranslationProgress;
}

interface ActiveCall {
  state: LanguageState;
  onStatus?: TranslateOptions["onStatus"];
  loading: boolean;
  settled: boolean;
  fail: (error: Error) => void;
}

interface ModelSource {
  size: number | null;
  read: (onChunk: (byteCount: number) => void) => Promise<ArrayBuffer>;
}

/** Per-language engine state, keyed by the spec's source code. */
const languageStates = new Map<string, LanguageState>();
/** Time the last download-progress callback was forwarded, for throttling. */
let lastProgressAt = -Infinity;
let activeCall: ActiveCall | null = null;

/**
 * Error raised by `translate()`.
 *
 * `code` is one of `"unsupported"`, `"model-unavailable"`, `"failed"` or
 * `"superseded"`. Callers silently ignore `"superseded"`.
 */
export class TranslationError extends Error {
  code: TranslationErrorCode;

  constructor(code: TranslationErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TranslationError";
    this.code = code;
  }
}

/**
 * Translate Japanese or Chinese text to English on-device.
 *
 * Status sequence: `"loading-model"` (only while the engine or model is still
 * loading, possibly repeated with download progress), then `"translating"`,
 * then `"ready"`. Rejects with a `TranslationError`; `"unsupported"` also covers a
 * source language without a model.
 */
export function translate(text: string, options: TranslateOptions = {}): Promise<TranslationResult> {
  activeCall?.fail(new TranslationError("superseded", "Replaced by a newer translation request."));
  const spec = translationModelFor(options.sourceLanguage ?? "Japanese");
  if (!spec) {
    return Promise.reject(new TranslationError("unsupported", `No translation model for ${options.sourceLanguage}.`));
  }
  const state = languageState(spec);

  return new Promise((resolve, reject) => {
    const call: ActiveCall = { state, onStatus: options.onStatus, loading: false, settled: false, fail: () => {} };
    const settle = <T>(callback: (value: T) => void, value: T) => {
      if (call.settled) return;
      call.settled = true;
      if (activeCall === call) activeCall = null;
      callback(value);
    };
    call.fail = (error) => settle(reject, error);
    activeCall = call;

    runTranslation(text, call).then(
      (result) => settle(resolve, result as TranslationResult),
      (error) => settle(reject, toTranslationError(error))
    );
  });
}

/** The engine state for a model, created on first use. */
function languageState(spec: TranslationModelSpec): LanguageState {
  let state = languageStates.get(spec.sourceCode);
  if (!state) {
    state = { spec, translatorPromise: null, modelPromise: null, loaded: false, progress: { loaded: 0, total: null } };
    languageStates.set(spec.sourceCode, state);
  }
  return state;
}

/** Load the engine and model if needed, then translate `text` for `call`. */
async function runTranslation(text: string, call: ActiveCall): Promise<TranslationResult | null> {
  if (!isSupported()) {
    throw new TranslationError("unsupported", "WebAssembly SIMD and Web Workers are required.");
  }

  const { state } = call;
  if (!state.loaded) {
    call.loading = true;
    reportStatus(call, "loading-model", { ...state.progress });
    await Promise.all([loadTranslator(state), loadModel(state)]);
    state.loaded = true;
    call.loading = false;
  }

  // A newer call took over while this one waited for loading.
  if (call.settled) return null;

  reportStatus(call, "translating");
  const translator = await loadTranslator(state);
  const response = await translator.translate({
    from: state.spec.sourceCode,
    to: TARGET_LANGUAGE,
    text,
    html: false
  });
  reportStatus(call, "ready");
  return { sourceText: text, targetText: response.target.text, alignments: null };
}

/** Check for Web Worker and WebAssembly SIMD support. */
function isSupported(): boolean {
  try {
    return typeof Worker === "function" && WebAssembly.validate(SIMD_TEST_MODULE);
  } catch {
    return false;
  }
}

/**
 * Import the engine and start its worker once; later calls reuse the instance.
 * A failed start is not cached, so the next call retries.
 */
function loadTranslator(state: LanguageState): Promise<Translator> {
  state.translatorPromise ??= startTranslator(state).catch((error) => {
    state.translatorPromise = null;
    throw error;
  });
  return state.translatorPromise;
}

/** Import the engine module, create the translator and wait for its worker. */
async function startTranslator(state: LanguageState): Promise<Translator> {
  // Imported by absolute URL: the engine is a static file, and Vite's dev server
  // would otherwise rewrite a root-relative dynamic import into a module request.
  const engineUrl = new URL(ENGINE_URL, window.location.href).href;
  const { LatencyOptimisedTranslator, TranslatorBacking } = (await import(/* @vite-ignore */ engineUrl)) as EngineModule;

  /**
   * Backing that serves the self-hosted model instead of the remote registry.
   * It keeps no buffer cache: the engine only asks for the model when its
   * single worker lacks it, and a crashed worker gets a new backing.
   */
  class LocalModelBacking extends TranslatorBacking {
    async loadModelRegistery() {
      return [{ from: state.spec.sourceCode, to: TARGET_LANGUAGE, files: {} }];
    }

    getTranslationModel(pair: unknown, options: unknown) {
      void pair;
      void options;
      return this.loadTranslationModel();
    }

    async loadTranslationModel() {
      const model = await loadModel(state);
      // The worker copies the buffers, so release ours for garbage collection.
      state.modelPromise = null;
      return model;
    }
  }

  let failStart: (error: unknown) => void = () => {};
  const startFailed = new Promise<never>((_, reject) => {
    failStart = reject;
  });
  const backing = new LocalModelBacking({ pivotLanguage: null });
  // Must be set before the translator is created: its worker binds it on creation.
  // Worker crashes never settle the engine's own promises, so fail the active
  // call here and discard the instance so the next call starts a fresh one.
  backing.onerror = (error) => {
    failStart(error);
    if (state.translatorPromise === pending) {
      state.translatorPromise = null;
      state.loaded = false;
      translator.delete().catch(() => {});
    }
    if (activeCall?.state === state) activeCall.fail(toTranslationError(error));
  };
  const translator = new LatencyOptimisedTranslator({ pivotLanguage: null }, backing);
  const pending = state.translatorPromise;
  await Promise.race([translator.worker, startFailed]);
  return translator;
}

/**
 * Download the model files once; later calls reuse the buffers. A failed
 * download is not cached, so the next call retries. Rejects with
 * `"model-unavailable"` on a non-2xx response or network error.
 */
function loadModel(state: LanguageState): Promise<TranslationModel> {
  state.modelPromise ??= downloadModel(state).catch((error) => {
    state.modelPromise = null;
    throw error;
  });
  return state.modelPromise;
}

/** Load all model files in parallel from Cache Storage or the network, reporting combined byte progress. */
async function downloadModel(state: LanguageState): Promise<TranslationModel> {
  try {
    const { files: modelFiles, cacheName } = state.spec;
    const parts = Object.keys(modelFiles) as (keyof typeof modelFiles)[];
    const sources = await Promise.all(parts.map((part) => openModelFile(modelFiles[part], cacheName)));
    const sizes = sources.map((source) => source.size);
    const progress: TranslationProgress = {
      loaded: 0,
      total: sizes.includes(null) ? null : sizes.reduce<number>((sum, size) => sum + (size ?? 0), 0)
    };
    reportModelProgress(state, progress);

    const buffers = await Promise.all(
      sources.map((source) =>
        source.read((byteCount) => {
          progress.loaded += byteCount;
          reportModelProgress(state, progress);
        })
      )
    );
    reportModelProgress(state, progress, true);
    const files = Object.fromEntries(parts.map((part, index) => [part, buffers[index]])) as Record<keyof typeof modelFiles, ArrayBuffer>;
    return { model: files.model, shortlist: files.lex, vocabs: [files.vocab], config: {} };
  } catch (error) {
    throw new TranslationError("model-unavailable", "Could not download the translation model.", { cause: error });
  }
}

/**
 * Open one model file from Cache Storage, falling back to the network. A
 * network download is stored in the cache once read in full. Throws on a
 * network error or non-2xx status.
 */
async function openModelFile(file: ModelFile, cacheName: string): Promise<ModelSource> {
  const cached = await readCachedModelFile(file, cacheName);
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
      storeCachedModelFile(file, cacheName, buffer);
      return buffer;
    }
  };
}

/**
 * Read a model file from Cache Storage. An entry of the wrong length is
 * deleted so it is fetched again. Cache errors are treated as a miss.
 */
async function readCachedModelFile(file: ModelFile, cacheName: string): Promise<ArrayBuffer | null> {
  try {
    if (typeof caches === "undefined") return null;
    const cache = await caches.open(cacheName);
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
 */
function storeCachedModelFile(file: ModelFile, cacheName: string, buffer: ArrayBuffer): void {
  if (typeof caches === "undefined" || buffer.byteLength !== file.size) return;
  caches
    .open(cacheName)
    .then((cache) => cache.put(file.url, new Response(buffer, { headers: { "content-type": "application/octet-stream" } })))
    .catch(() => {});
}

/** Fetch one model file and reject on a non-2xx status. */
async function fetchModelFile(url: string): Promise<Response> {
  const response = await fetch(url, { credentials: "omit" });
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`);
  }
  return response;
}

/** Read a response body as a stream, reporting each chunk's size. */
async function readBody(response: Response, onChunk: (byteCount: number) => void): Promise<ArrayBuffer> {
  if (!response.body) {
    const buffer = await response.arrayBuffer();
    onChunk(buffer.byteLength);
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
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
 */
function reportModelProgress(state: LanguageState, progress: TranslationProgress, final = false): void {
  state.progress = { ...progress };
  const now = performance.now();
  if (!final && now - lastProgressAt < PROGRESS_INTERVAL_MS) return;
  lastProgressAt = now;
  if (activeCall?.loading && activeCall.state === state) {
    reportStatus(activeCall, "loading-model", { ...progress });
  }
}

/** Invoke a call's `onStatus` callback unless the call has already settled. */
function reportStatus(call: ActiveCall, status: TranslationStatus, info?: TranslationProgress): void {
  if (call.settled || !call.onStatus) return;
  if (info) {
    call.onStatus(status, info);
  } else {
    call.onStatus(status);
  }
}

/** Map any error to a `TranslationError`, keeping existing codes. */
function toTranslationError(error: unknown): TranslationError {
  if (error instanceof TranslationError) return error;
  if ((error as { constructor?: { name?: string } } | null)?.constructor?.name === "SupersededError") {
    return new TranslationError("superseded", "Replaced by a newer translation request.", { cause: error });
  }
  return new TranslationError("failed", "Translation failed.", { cause: error });
}
