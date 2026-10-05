/**
 * Registry of the on-device translation models (SPEC-002): which material
 * languages can be translated to English, and where each model's files live.
 * Pure data and lookups, so eligibility checks never load the engine.
 */

export interface ModelFile {
  url: string;
  size: number;
}

/** One self-hosted Bergamot model: its engine language code, files and Cache API entry. */
export interface TranslationModelSpec {
  /** Source language code passed to the engine. */
  sourceCode: string;
  files: { model: ModelFile; lex: ModelFile; vocab: ModelFile };
  /** Versioned by model path; a new model version gets a new cache. */
  cacheName: string;
}

/** Target language of every registered model. */
export const TARGET_LANGUAGE = "en";

/** Models by lowercase material language name. */
const TRANSLATION_MODELS: Record<string, TranslationModelSpec> = {
  japanese: {
    sourceCode: "ja",
    files: {
      model: { url: "/models/ja-en-2.1/model.bin", size: 43977787 },
      lex: { url: "/models/ja-en-2.1/lex.bin", size: 9348172 },
      vocab: { url: "/models/ja-en-2.1/vocab.spm", size: 1443222 }
    },
    cacheName: "translation-models:/models/ja-en-2.1/"
  },
  chinese: {
    sourceCode: "zh",
    files: {
      model: { url: "/models/zh-en-2.1/model.bin", size: 43977787 },
      lex: { url: "/models/zh-en-2.1/lex.bin", size: 9219192 },
      vocab: { url: "/models/zh-en-2.1/vocab.spm", size: 1359697 }
    },
    cacheName: "translation-models:/models/zh-en-2.1/"
  }
};

/** The model translating the given material language to English, or null when unsupported. Case-insensitive. */
export function translationModelFor(languageName: string | null | undefined): TranslationModelSpec | null {
  return TRANSLATION_MODELS[String(languageName || "").toLowerCase()] ?? null;
}
