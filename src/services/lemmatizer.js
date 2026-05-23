import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import lemmatizer from "wink-lemmatizer";

const require = createRequire(import.meta.url);
const kuromoji = require("kuromoji");
const kuromojiRoot = dirname(require.resolve("kuromoji/package.json"));

let japaneseTokenizerPromise;

// Kuromoji startup is expensive, so build one tokenizer lazily and reuse it.
function getJapaneseTokenizer() {
  if (!japaneseTokenizerPromise) {
    japaneseTokenizerPromise = new Promise((resolve, reject) => {
      kuromoji.builder({ dicPath: join(kuromojiRoot, "dict") }).build((error, tokenizer) => {
        if (error) reject(error);
        else resolve(tokenizer);
      });
    });
  }
  return japaneseTokenizerPromise;
}

function isUsableJapaneseToken(token) {
  if (!token.surface_form || /^\s+$/.test(token.surface_form)) return false;
  if (token.pos === "記号") return false;
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}A-Za-z0-9]/u.test(token.surface_form);
}

function englishLemma(lower) {
  // Prefer lemmas that behave like dictionary headwords for study lists.
  const adjective = lemmatizer.adjective(lower);
  const noun = lemmatizer.noun(lower);
  const verb = lemmatizer.verb(lower);

  if (lower.endsWith("ing") && noun === lower) return lower;
  if (noun !== lower && verb === lower) return noun;
  if (verb !== lower && noun === lower) return verb;
  if (noun !== lower && verb !== lower) {
    if (lower.endsWith("s") && !lower.endsWith("ss")) return noun;
    return verb;
  }
  if (adjective !== lower) return adjective;
  return lower;
}

function chineseLemma(surface) {
  if (surface.length > 1 && /[了着過过]$/u.test(surface)) {
    return surface.slice(0, -1);
  }
  return surface;
}

export async function tokenizeForLanguage(text, languageName) {
  const normalizedLanguageName = languageName.toLowerCase();
  if (languageName.toLowerCase() === "japanese" || languageName === "日本語") {
    const tokenizer = await getJapaneseTokenizer();
    return tokenizer
      .tokenize(text)
      .filter(isUsableJapaneseToken)
      .map((token, index) => {
        const lemma = token.basic_form && token.basic_form !== "*" ? token.basic_form : token.surface_form;
        return {
          position: index,
          surface: token.surface_form,
          normalized: token.surface_form,
          lemma,
          pos: [token.pos, token.pos_detail_1].filter((value) => value && value !== "*").join(":"),
          paragraphIndex: 0,
          sentenceIndex: 0
        };
      });
  }

  if (normalizedLanguageName === "english") {
    return (
      text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g)?.map((surface, index) => {
        const lower = surface.toLowerCase();
        const lemma = englishLemma(lower);
        return {
          position: index,
          surface,
          normalized: lower,
          lemma,
          pos: null,
          paragraphIndex: 0,
          sentenceIndex: 0
        };
      }) || []
    );
  }

  if (normalizedLanguageName === "chinese") {
    // Intl.Segmenter gives better word boundaries than character splitting when
    // the runtime provides Chinese segmentation support.
    const segmenter = new Intl.Segmenter("zh", { granularity: "word" });
    return [...segmenter.segment(text)]
      .filter((segment) => segment.isWordLike && /[\p{Script=Han}A-Za-z0-9]/u.test(segment.segment))
      .map((segment, index) => {
        const lemma = chineseLemma(segment.segment);
        return {
          position: index,
          surface: segment.segment,
          normalized: segment.segment,
          lemma,
          pos: null,
          paragraphIndex: 0,
          sentenceIndex: 0
        };
      });
  }

  return text
    .match(/[\p{Letter}\p{Number}'-]+/gu)
    ?.map((surface, index) => ({
      position: index,
      surface,
      normalized: surface.toLowerCase(),
      lemma: surface.toLowerCase(),
      pos: null,
      paragraphIndex: 0,
      sentenceIndex: 0
    })) || [];
}
