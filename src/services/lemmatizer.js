import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import lemmatizer from "wink-lemmatizer";

const require = createRequire(import.meta.url);
const kuromoji = require("kuromoji");
const kuromojiRoot = dirname(require.resolve("kuromoji/package.json"));

let japaneseTokenizerPromise;

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

export async function tokenizeForLanguage(text, languageName) {
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

  if (languageName.toLowerCase() === "english") {
    return (
      text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g)?.map((surface, index) => {
        const lower = surface.toLowerCase();
        const lemma = lemmatizer.verb(lemmatizer.noun(lemmatizer.adjective(lower)));
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
