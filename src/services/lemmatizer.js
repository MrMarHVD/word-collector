import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import lemmatizer from "wink-lemmatizer";

const require = createRequire(import.meta.url);
const kuromoji = require("kuromoji");
const kuromojiRoot = dirname(require.resolve("kuromoji/package.json"));

let japaneseTokenizerPromise;

// Kuromoji startup is expensive, so build one tokenizer lazily and reuse it.
// Return the shared Japanese tokenizer promise.
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

// Filter out punctuation and whitespace from Kuromoji output.
function isUsableJapaneseToken(token) {
  if (!token.surface_form || /^\s+$/.test(token.surface_form)) return false;
  if (token.pos === "記号") return false;
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}A-Za-z0-9]/u.test(token.surface_form);
}

// Convert katakana to hiragana by a 0x60 codepoint shift across the 0x30A1..0x30F6 range.
function katakanaToHiragana(value) {
  if (!value) return "";
  let result = "";
  for (const char of value) {
    const code = char.codePointAt(0);
    if (code >= 0x30A1 && code <= 0x30F6) {
      result += String.fromCodePoint(code - 0x60);
    } else {
      result += char;
    }
  }
  return result;
}

const JAPANESE_POS_LABELS = {
  名詞: "noun",
  動詞: "verb",
  形容詞: "i-adjective",
  助詞: "particle",
  副詞: "adverb",
  連体詞: "adnominal",
  助動詞: "auxiliary",
  接続詞: "conjunction",
  感動詞: "interjection",
  接頭詞: "prefix"
};

// Map a Kuromoji (pos, pos_detail_1, conjugated_type) triple to a human label.
function japanesePosSubcategory(pos, posDetail, conjugatedType) {
  if (pos === "動詞") {
    if (conjugatedType && conjugatedType.startsWith("一段")) return "ichidan verb";
    if (conjugatedType && conjugatedType.startsWith("五段")) {
      const row = conjugatedType.match(/五段・([カガサザタダナバマラワ])/u);
      return row ? `godan verb (${row[1]}-row)` : "godan verb";
    }
    if (conjugatedType && conjugatedType.startsWith("サ変")) return "suru verb";
    if (conjugatedType && conjugatedType.startsWith("カ変")) return "kuru verb";
    return "verb";
  }
  if (pos === "名詞" && posDetail === "形容動詞語幹") return "na-adjective";
  if (pos === "形容詞") return "i-adjective";
  return JAPANESE_POS_LABELS[pos] || pos || "";
}

const JAPANESE_CONJUGATION_LABELS = {
  基本形: "dictionary",
  未然形: "negative stem",
  "未然ウ接続": "volitional stem",
  連用形: "stem",
  "連用タ接続": "past stem",
  "連用テ接続": "te-form",
  仮定形: "conditional",
  命令e: "imperative",
  命令ro: "imperative",
  命令yo: "imperative",
  体言接続: "attributive",
  "体言接続特殊": "attributive"
};

// Map a Kuromoji conjugated_form to a human label, defaulting to the raw form.
function japaneseConjugationForm(form) {
  if (!form || form === "*") return "";
  return JAPANESE_CONJUGATION_LABELS[form] || form;
}

// Prefer lemmas that behave like dictionary headwords for study lists.
function englishLemma(lower) {
  const adjective = lemmatizer.adjective(lower);
  const noun = lemmatizer.noun(lower);
  const verb = lemmatizer.verb(lower);

  if (lower.endsWith("ing") && noun === lower) return { lemma: lower, pos: "noun" };
  if (noun !== lower && verb === lower) return { lemma: noun, pos: "noun" };
  if (verb !== lower && noun === lower) return { lemma: verb, pos: "verb" };
  if (noun !== lower && verb !== lower) {
    if (lower.endsWith("s") && !lower.endsWith("ss")) return { lemma: noun, pos: "noun" };
    return { lemma: verb, pos: "verb" };
  }
  if (adjective !== lower) return { lemma: adjective, pos: "adjective" };
  return { lemma: lower, pos: "unknown" };
}

// Remove common Chinese aspect suffixes from simple token forms.
function chineseLemma(surface) {
  if (surface.length > 1 && /[了着過过]$/u.test(surface)) {
    return surface.slice(0, -1);
  }
  return surface;
}

// Tokenize text into surface forms and lemmas for the selected study language.
export async function tokenizeForLanguage(text, languageName) {
  const normalizedLanguageName = languageName.toLowerCase();
  if (languageName.toLowerCase() === "japanese" || languageName === "日本語") {
    const tokenizer = await getJapaneseTokenizer();
    return tokenizer
      .tokenize(text)
      .filter(isUsableJapaneseToken)
      .map((token, index) => {
        const lemma = token.basic_form && token.basic_form !== "*" ? token.basic_form : token.surface_form;
        const reading = token.reading && token.reading !== "*" ? katakanaToHiragana(token.reading) : "";
        return {
          position: index,
          surface: token.surface_form,
          normalized: token.surface_form,
          lemma,
          pos: [token.pos, token.pos_detail_1].filter((value) => value && value !== "*").join(":"),
          posSubcategory: japanesePosSubcategory(token.pos, token.pos_detail_1, token.conjugated_type),
          reading,
          conjugationForm: japaneseConjugationForm(token.conjugated_form),
          paragraphIndex: 0,
          sentenceIndex: 0
        };
      });
  }

  if (normalizedLanguageName === "english") {
    return (
      text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g)?.map((surface, index) => {
        const lower = surface.toLowerCase();
        const { lemma, pos } = englishLemma(lower);
        return {
          position: index,
          surface,
          normalized: lower,
          lemma,
          pos,
          posSubcategory: "",
          reading: "",
          conjugationForm: "",
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
          posSubcategory: "",
          reading: "",
          conjugationForm: "",
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
      posSubcategory: "",
      reading: "",
      conjugationForm: "",
      paragraphIndex: 0,
      sentenceIndex: 0
    })) || [];
}
