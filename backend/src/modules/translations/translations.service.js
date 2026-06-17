/**
 * @fileoverview Translations service. Routing, lookup, disambiguation, and
 * background-backfill logic for the word translation pipeline.
 *
 * Translation routes are a static table of (source, target) language pairs
 * each pointing to a dictionary lookup function. `translationForToken` and
 * `displayTranslationForToken` resolve the best translation for a single
 * reader token. `getTranslationCandidates` batch-resolves translations for
 * all tokens in an import run. `backfillMaterialTranslations` and
 * `backfillUserTranslations` fill missing translations in the background so
 * switching native language stays fast.
 *
 * Coordinates with: dictionaries service, translations repository,
 * words repository, materials repository, database repository (transaction).
 */

import { normalizeName } from "../../shared/normalize.js";
import { lookupChineseEnglish, lookupChineseJapanese, lookupChineseJapaneseEntries, lookupEnglishChinese, lookupEnglishChineseEntries, lookupEnglishJapanese, lookupEnglishJapaneseEntries, lookupFrenchEnglish, lookupFrenchEnglishEntries, lookupJapaneseChinese, lookupJapaneseChineseEntries, lookupJapaneseEnglish, lookupSpanishEnglish, lookupSpanishEnglishEntries } from "../dictionaries/dictionaries.service.js";
import lemmatizer from "wink-lemmatizer";

export const TRANSLATION_ROUTES = [
  { source: "English", target: "English", lookup: (_dictionariesRepository, term) => term },
  { source: "English", target: "Japanese", lookup: lookupEnglishJapanese },
  { source: "English", target: "Chinese", lookup: lookupEnglishChinese },
  { source: "Japanese", target: "English", lookup: lookupJapaneseEnglish },
  { source: "Japanese", target: "Japanese", lookup: (_dictionariesRepository, term) => term },
  { source: "Japanese", target: "Chinese", lookup: lookupJapaneseChinese },
  { source: "Chinese", target: "English", lookup: lookupChineseEnglish },
  { source: "Chinese", target: "Japanese", lookup: lookupChineseJapanese },
  { source: "Chinese", target: "Chinese", lookup: (_dictionariesRepository, term) => term },
  { source: "Spanish", target: "English", lookup: lookupSpanishEnglish },
  { source: "French", target: "English", lookup: lookupFrenchEnglish }
];

/**
 * Normalise a language name or object to one of the canonical string keys used
 * in translation route matching (`"English"`, `"Japanese"`, `"Chinese"`,
 * `"Spanish"`, `"French"`), or `""` when the input is not recognised.
 * @param {string|{ name: string }|null} language
 * @returns {string}
 */
export function languageKey(language) {
  if (!language) return "";
  const name = typeof language === "string" ? language : language.name;
  const normalized = String(name || "").toLowerCase();
  if (normalized === "english") return "English";
  if (normalized === "japanese" || name === "日本語") return "Japanese";
  if (normalized === "chinese") return "Chinese";
  if (normalized === "spanish") return "Spanish";
  if (normalized === "french") return "French";
  return "";
}

/**
 * Find the translation route object for a (source, target) pair, or `null`
 * when no route exists.
 * @param {string|object} sourceLanguage
 * @param {string|object} targetLanguage
 * @returns {{ source: string, target: string, lookup: function }|null}
 */
export function translationRoute(sourceLanguage, targetLanguage) {
  const source = languageKey(sourceLanguage);
  const target = languageKey(targetLanguage);
  return TRANSLATION_ROUTES.find((route) => route.source === source && route.target === target) || null;
}

/**
 * Return the distinct target language keys for all routes whose source matches
 * the given language.
 * @param {string|object} sourceLanguage
 * @returns {string[]}
 */
export function translationTargetsForLanguage(sourceLanguage) {
  const source = languageKey(sourceLanguage);
  return [...new Set(TRANSLATION_ROUTES.filter((route) => route.source === source).map((route) => route.target))];
}

/**
 * Look up a single translation using the matching route's dictionary function.
 * Returns `""` when no route exists for the language pair.
 * @param {object} repositories
 * @param {string|object} sourceLanguage
 * @param {string|object} targetLanguage
 * @param {string} term
 * @returns {Promise<string>}
 */
export async function lookupTranslation(repositories, sourceLanguage, targetLanguage, term) {
  const route = translationRoute(sourceLanguage, targetLanguage);
  return route ? normalizeName(await route.lookup(repositories.dictionaries, term)) : "";
}

const ENGLISH_IRREGULAR_LEMMAS = {
  am: ["be"],
  is: ["be"],
  are: ["be"],
  was: ["be"],
  were: ["be"],
  been: ["be"],
  being: ["be"],
  has: ["have"],
  have: ["have"],
  had: ["have"],
  does: ["do"],
  did: ["do"],
  done: ["do"]
};

function tokenSourceTerms(token) {
  const surface = normalizeName(token.surface || token.word).toLowerCase();
  const lemma = normalizeName(token.lemma || token.word || token.surface).toLowerCase();
  const lemmatized = surface
    ? [lemmatizer.verb(surface), lemmatizer.noun(surface), lemmatizer.adjective(surface)]
    : [];
  const irregular = ENGLISH_IRREGULAR_LEMMAS[surface] || [];
  return [...irregular, surface, lemma, ...lemmatized].filter((term, index, terms) => term && terms.indexOf(term) === index);
}

const FRENCH_IRREGULAR_LEMMAS = {
  suis: ["être"],
  es: ["être"],
  est: ["être"],
  sommes: ["être"],
  êtes: ["être"],
  sont: ["être"],
  étais: ["être"],
  était: ["être"],
  étions: ["être"],
  étiez: ["être"],
  étaient: ["être"],
  serai: ["être"],
  seras: ["être"],
  sera: ["être"],
  serons: ["être"],
  serez: ["être"],
  seront: ["être"],
  ai: ["avoir"],
  as: ["avoir"],
  a: ["avoir"],
  avons: ["avoir"],
  avez: ["avoir"],
  ont: ["avoir"],
  avais: ["avoir"],
  avait: ["avoir"],
  avions: ["avoir"],
  aviez: ["avoir"],
  avaient: ["avoir"],
  vais: ["aller"],
  vas: ["aller"],
  va: ["aller"],
  allons: ["aller"],
  allez: ["aller"],
  vont: ["aller"],
  veux: ["vouloir"],
  veut: ["vouloir"],
  voulons: ["vouloir"],
  voulez: ["vouloir"],
  veulent: ["vouloir"],
  voulais: ["vouloir"],
  voulait: ["vouloir"],
  voulions: ["vouloir"],
  vouliez: ["vouloir"],
  voulaient: ["vouloir"],
  peux: ["pouvoir"],
  peut: ["pouvoir"],
  pouvons: ["pouvoir"],
  pouvez: ["pouvoir"],
  peuvent: ["pouvoir"],
  pouvais: ["pouvoir"],
  pouvait: ["pouvoir"],
  pouvions: ["pouvoir"],
  pouviez: ["pouvoir"],
  pouvaient: ["pouvoir"],
  dis: ["dire"],
  dit: ["dire"],
  dites: ["dire"],
  disent: ["dire"],
  disait: ["dire"],
  disaient: ["dire"],
  ferai: ["faire"],
  fera: ["faire"],
  feront: ["faire"],
  fais: ["faire"],
  fait: ["faire"],
  faisons: ["faire"],
  faites: ["faire"],
  font: ["faire"],
  faisait: ["faire"],
  faisaient: ["faire"],
  viens: ["venir"],
  vient: ["venir"],
  venons: ["venir"],
  venez: ["venir"],
  viennent: ["venir"],
  venait: ["venir"],
  venaient: ["venir"]
};

const SPANISH_IRREGULAR_LEMMAS = {
  soy: ["ser"],
  eres: ["ser"],
  es: ["ser"],
  somos: ["ser"],
  sois: ["ser"],
  son: ["ser"],
  fui: ["ser", "ir"],
  fuiste: ["ser", "ir"],
  fue: ["ser", "ir"],
  fuimos: ["ser", "ir"],
  fuisteis: ["ser", "ir"],
  fueron: ["ser", "ir"],
  estoy: ["estar"],
  estás: ["estar"],
  esta: ["estar"],
  está: ["estar"],
  estamos: ["estar"],
  estáis: ["estar"],
  están: ["estar"],
  voy: ["ir"],
  vas: ["ir"],
  va: ["ir"],
  vamos: ["ir"],
  vais: ["ir"],
  van: ["ir"],
  tengo: ["tener"],
  tienes: ["tener"],
  tiene: ["tener"],
  tenemos: ["tener"],
  tenéis: ["tener"],
  tienen: ["tener"],
  he: ["haber"],
  has: ["haber"],
  ha: ["haber"],
  hemos: ["haber"],
  habéis: ["haber"],
  han: ["haber"],
  había: ["haber"],
  habías: ["haber"],
  habíamos: ["haber"],
  habíais: ["haber"],
  habían: ["haber"],
  hago: ["hacer"],
  haces: ["hacer"],
  hace: ["hacer"],
  hacemos: ["hacer"],
  hacéis: ["hacer"],
  hacen: ["hacer"]
};

function uniqueTerms(terms) {
  return terms.filter((term, index) => term && terms.indexOf(term) === index);
}

function preferGeneratedLemmas(terms, baseTerms) {
  const unique = uniqueTerms(terms);
  const base = new Set(baseTerms.filter(Boolean));
  const generated = unique.filter((term) => !base.has(term));
  return generated.length ? [...generated, ...unique.filter((term) => base.has(term))] : unique;
}

function frenchLemmaCandidates(term) {
  const clean = normalizeName(term).toLowerCase();
  const candidates = [clean, ...(FRENCH_IRREGULAR_LEMMAS[clean] || [])];
  if (clean.length <= 2) {
    return uniqueTerms(candidates);
  }

  if (clean.endsWith("aux")) candidates.push(`${clean.slice(0, -3)}al`);
  if (clean.endsWith("eaux")) candidates.push(clean.slice(0, -1));
  if (clean.endsWith("x")) candidates.push(clean.slice(0, -1));
  if (clean.endsWith("s")) candidates.push(clean.slice(0, -1));

  const verbEndings = [
    ["eraient", "er"], ["iraient", "ir"], ["raient", "re"],
    ["erions", "er"], ["irions", "ir"], ["rions", "re"],
    ["eriez", "er"], ["iriez", "ir"], ["riez", "re"],
    ["eront", "er"], ["iront", "ir"], ["ront", "re"],
    ["erai", "er"], ["irai", "ir"], ["rai", "re"],
    ["eras", "er"], ["iras", "ir"], ["ras", "re"],
    ["erez", "er"], ["irez", "ir"], ["rez", "re"],
    ["aient", "er"], ["issent", "ir"], ["ent", "er"],
    ["ions", "er"], ["issons", "ir"], ["ons", "er"],
    ["iez", "er"], ["issez", "ir"], ["ez", "er"],
    ["ais", "er"], ["ait", "er"], ["ant", "er"],
    ["is", "ir"], ["it", "ir"], ["i", "ir"],
    ["us", "re"], ["ut", "re"], ["u", "re"],
    ["e", "er"], ["es", "er"]
  ];
  for (const [ending, infinitiveEnding] of verbEndings) {
    if (clean.length > ending.length + 1 && clean.endsWith(ending)) {
      candidates.push(`${clean.slice(0, -ending.length)}${infinitiveEnding}`);
    }
  }
  if (clean.endsWith("geons")) candidates.push(`${clean.slice(0, -4)}er`);
  if (clean.endsWith("çons")) candidates.push(`${clean.slice(0, -4)}cer`);
  return uniqueTerms(candidates);
}

function spanishLemmaCandidates(term) {
  const clean = normalizeName(term).toLowerCase();
  const candidates = [clean, ...(SPANISH_IRREGULAR_LEMMAS[clean] || [])];
  if (clean.length <= 2) {
    return uniqueTerms(candidates);
  }

  if (clean.endsWith("ces")) candidates.push(`${clean.slice(0, -3)}z`);
  if (clean.endsWith("es")) candidates.push(clean.slice(0, -2));
  if (clean.endsWith("s")) candidates.push(clean.slice(0, -1));

  const verbEndings = [
    ["aríamos", "ar"], ["eríamos", "er"], ["iríamos", "ir"],
    ["aríais", "ar"], ["eríais", "er"], ["iríais", "ir"],
    ["aremos", "ar"], ["eremos", "er"], ["iremos", "ir"],
    ["asteis", "ar"], ["isteis", "ir"], ["abais", "ar"],
    ["arían", "ar"], ["erían", "er"], ["irían", "ir"],
    ["aría", "ar"], ["ería", "er"], ["iría", "ir"],
    ["aron", "ar"], ["ieron", "er"], ["aban", "ar"], ["ían", "er"],
    ["aste", "ar"], ["iste", "ir"], ["amos", "ar"], ["emos", "er"], ["imos", "ir"],
    ["áis", "ar"], ["éis", "er"], ["ís", "ir"],
    ["aba", "ar"], ["ará", "ar"], ["erá", "er"], ["irá", "ir"],
    ["aré", "ar"], ["eré", "er"], ["iré", "ir"],
    ["as", "ar"], ["es", "er"], ["an", "ar"], ["en", "er"],
    ["ó", "ar"], ["ió", "er"], ["é", "ar"], ["í", "ir"],
    ["a", "ar"], ["e", "er"], ["o", "ar"]
  ];
  for (const [ending, infinitiveEnding] of verbEndings) {
    if (clean.length > ending.length + 1 && clean.endsWith(ending)) {
      candidates.push(`${clean.slice(0, -ending.length)}${infinitiveEnding}`);
    }
  }
  if (clean.endsWith("ando")) candidates.push(`${clean.slice(0, -4)}ar`);
  if (clean.endsWith("iendo")) {
    candidates.push(`${clean.slice(0, -5)}er`);
    candidates.push(`${clean.slice(0, -5)}ir`);
  }
  return uniqueTerms(candidates);
}

async function lookupDictionaryEntriesForRoute(repositories, sourceLanguage, targetLanguage, term) {
  const source = languageKey(sourceLanguage);
  const target = languageKey(targetLanguage);
  if (source === "English" && target === "Japanese") {
    return lookupEnglishJapaneseEntries(repositories.dictionaries, term, 50);
  }
  if (source === "English" && target === "Chinese") {
    return lookupEnglishChineseEntries(repositories.dictionaries, term, 50);
  }
  if (source === "Japanese" && target === "Chinese") {
    return lookupJapaneseChineseEntries(repositories.dictionaries, term, 50);
  }
  if (source === "Chinese" && target === "Japanese") {
    return lookupChineseJapaneseEntries(repositories.dictionaries, term, 50);
  }
  if (source === "Spanish" && target === "English") {
    return lookupSpanishEnglishEntries(repositories.dictionaries, term, 50);
  }
  if (source === "French" && target === "English") {
    return lookupFrenchEnglishEntries(repositories.dictionaries, term, 50);
  }
  return [];
}

function candidatePosRank(candidate, tokenPos) {
  const expected = normalizeName(tokenPos).toLowerCase();
  const actual = normalizeName(candidate.pos).toLowerCase();
  if (!expected || expected === "unknown") return 0;
  if (actual === expected) return 0;
  if (!actual) return 1;
  return 2;
}

function rankTranslationCandidates(sourceLanguage, targetLanguage, token, candidates) {
  if (languageKey(sourceLanguage) !== "English" || languageKey(targetLanguage) !== "Japanese") {
    return candidates;
  }
  return candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort((a, b) => {
      const posDiff = candidatePosRank(a.candidate, token.pos) - candidatePosRank(b.candidate, token.pos);
      return posDiff || a.index - b.index;
    })
    .map((entry) => entry.candidate);
}

function candidateSourceTerms(sourceLanguage, token) {
  if (languageKey(sourceLanguage) === "English") {
    return tokenSourceTerms(token);
  }
  const surface = normalizeName(token.surface || token.word);
  const lemma = normalizeName(token.lemma || token.word || token.surface);
  const source = languageKey(sourceLanguage);
  const baseTerms = [surface, lemma];
  if (source === "French") {
    return preferGeneratedLemmas(baseTerms.flatMap(frenchLemmaCandidates), baseTerms);
  }
  if (source === "Spanish") {
    return uniqueTerms([...baseTerms, ...baseTerms.flatMap(spanishLemmaCandidates)]);
  }
  return uniqueTerms(baseTerms);
}

/**
 * Return the full ranked list of translation candidates for a token, used to
 * populate the disambiguation pane in the reader. Each candidate includes
 * `source`, `translation`, and `pos`. Returns `[]` when no route exists.
 * @param {object} repositories
 * @param {string|object} sourceLanguage
 * @param {string|object} targetLanguage
 * @param {object} token - Token with `surface`, `lemma`/`word`, and `pos`.
 * @returns {Promise<Array<{ source: string, translation: string, pos: string }>>}
 */
export async function translationDisambiguationCandidates(repositories, sourceLanguage, targetLanguage, token) {
  if (!translationRoute(sourceLanguage, targetLanguage)) {
    return [];
  }
  const candidates = [];
  const seen = new Set();
  for (const source of candidateSourceTerms(sourceLanguage, token)) {
    for (const entry of await lookupDictionaryEntriesForRoute(repositories, sourceLanguage, targetLanguage, source)) {
      if (entry.translation.toLowerCase() === String(entry.source || source).toLowerCase()) continue;
      const key = `${entry.source || source}\u0000${entry.translation.toLowerCase()}\u0000${entry.pos.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ source: entry.source || source, translation: entry.translation, pos: entry.pos || "" });
    }
  }
  return rankTranslationCandidates(sourceLanguage, targetLanguage, token, candidates);
}

/**
 * Resolve the best single display translation for a token. Uses the first
 * disambiguation candidate when available; otherwise falls back to a direct
 * dictionary lookup on the lemma, then the surface.
 * @param {object} repositories
 * @param {string|object} sourceLanguage
 * @param {string|object} targetLanguage
 * @param {object} token
 * @returns {Promise<string>}
 */
export async function displayTranslationForToken(repositories, sourceLanguage, targetLanguage, token) {
  const candidates = await translationDisambiguationCandidates(repositories, sourceLanguage, targetLanguage, token);
  if (candidates.length) {
    return candidates[0].translation;
  }
  return (await lookupTranslation(repositories, sourceLanguage, targetLanguage, token.lemma || token.word))
    || (await lookupTranslation(repositories, sourceLanguage, targetLanguage, token.surface || token.word));
}

/**
 * Return the best supported target language for translating from `sourceLanguage`
 * into the user's `nativeLanguage`. Falls back to English when the direct route
 * is unavailable; returns `""` when no route at all exists.
 * @param {string|object} sourceLanguage
 * @param {string} nativeLanguage
 * @returns {string}
 */
export function supportedTargetNativeLanguage(sourceLanguage, nativeLanguage) {
  if (translationRoute(sourceLanguage, nativeLanguage)) return nativeLanguage;
  if (translationRoute(sourceLanguage, "English")) return "English";
  return "";
}

/**
 * Return the normalised stored translation for a word in the given language,
 * or `""` when none is stored.
 * @param {object} repositories
 * @param {number} wordId
 * @param {string} nativeLanguage
 * @returns {Promise<string>}
 */
export async function getStoredTranslation(repositories, wordId, nativeLanguage) {
  return normalizeName((await repositories.translations.findWordTranslation(wordId, nativeLanguage))?.translation || "");
}

/**
 * Return `true` when a `word_translations` row exists for the given word/language
 * pair, regardless of whether the stored value is empty. Distinguishes "translation
 * attempted and empty" from "never attempted".
 * @param {object} repositories
 * @param {number} wordId
 * @param {string} nativeLanguage
 * @returns {Promise<boolean>}
 */
export async function hasTranslationAttempt(repositories, wordId, nativeLanguage) {
  return Boolean(await repositories.translations.findWordTranslation(wordId, nativeLanguage));
}

/**
 * Return `true` when the stored translation is non-empty and differs from both
 * the token's lemma and surface (i.e. it is genuinely useful, not just an echo
 * of the source word).
 * @param {object} repositories
 * @param {number} wordId
 * @param {string} nativeLanguage
 * @param {{ lemma: string, surface: string }} token
 * @returns {Promise<boolean>}
 */
export async function hasUsableStoredTranslation(repositories, wordId, nativeLanguage, token) {
  const stored = await getStoredTranslation(repositories, wordId, nativeLanguage);
  if (!stored) return false;
  return stored.toLowerCase() !== token.lemma.toLowerCase() && stored.toLowerCase() !== token.surface.toLowerCase();
}

/**
 * Resolve the translation to store for a token during import. Uses the
 * disambiguation candidate list when available; otherwise checks the
 * pre-computed `translations` map (keyed by lemma), then falls back to a live
 * dictionary lookup on the surface.
 * @param {object} repositories
 * @param {string|object} sourceLanguage
 * @param {string|object} targetLanguage
 * @param {object} token
 * @param {Map<string, string>} [translations] - Pre-fetched lemma→translation map.
 * @returns {Promise<string>}
 */
export async function translationForToken(repositories, sourceLanguage, targetLanguage, token, translations = new Map()) {
  if ((await translationDisambiguationCandidates(repositories, sourceLanguage, targetLanguage, token)).length) {
    return displayTranslationForToken(repositories, sourceLanguage, targetLanguage, token);
  }
  const stored = translations.get(token.lemma.toLowerCase()) || "";
  if (stored) return stored;
  return lookupTranslation(repositories, sourceLanguage, targetLanguage, token.surface);
}

// Mirror the SQL preference of findWordInLanguage: an exact surface match wins
// over a lemma-only match, then the lower word id for stability.
function pickPreferredWordMatch(matches, surfaceKey) {
  return [...matches].sort((a, b) => {
    const aSurface = String(a.word || "").toLowerCase() === surfaceKey ? 0 : 1;
    const bSurface = String(b.word || "").toLowerCase() === surfaceKey ? 0 : 1;
    if (aSurface !== bSurface) return aSurface - bSurface;
    return (a.id || 0) - (b.id || 0);
  })[0];
}

/**
 * Batch-resolve the best stored or looked-up translation for each unique lemma
 * in `tokens`. Uses two batched DB queries (words + translations) rather than
 * a per-token lookup; existing usable translations are re-used, reducing
 * dictionary calls proportional to new vocabulary. Returns a `Map<lemma, translation>`.
 * Returns an empty Map when no route exists for the language pair.
 * @param {object} repositories
 * @param {number} userId
 * @param {object} sourceLanguage
 * @param {string} targetLanguage
 * @param {object[]} tokens
 * @returns {Promise<Map<string, string>>}
 */
export async function getTranslationCandidates(repositories, userId, sourceLanguage, targetLanguage, tokens) {
  if (!translationRoute(sourceLanguage, targetLanguage)) {
    return new Map();
  }

  // One representative token per unique lemma; its surface drives the
  // existing-word match exactly as the previous per-token lookups did.
  const uniqueTokens = new Map();
  for (const token of tokens) {
    const key = token.lemma.toLowerCase();
    if (!uniqueTokens.has(key)) {
      uniqueTokens.set(key, token);
    }
  }
  if (!uniqueTokens.size) {
    return new Map();
  }

  // Two batched queries replace the per-lemma word and translation lookups;
  // the original single-row match preference is re-applied in memory.
  const representatives = [...uniqueTokens.values()];
  const surfaces = [...new Set(representatives.map((token) => String(token.surface || "")))];
  const lemmas = [...new Set(representatives.map((token) => String(token.lemma || "")))];
  const rows = await repositories.words.findWordsInLanguageByTerms(sourceLanguage.id, surfaces, lemmas);

  const rowsByWord = new Map();
  const rowsByLemma = new Map();
  for (const row of rows) {
    const wordKey = String(row.word || "").toLowerCase();
    const lemmaKey = String(row.lemma || row.word || "").toLowerCase();
    if (!rowsByWord.has(wordKey)) rowsByWord.set(wordKey, []);
    rowsByWord.get(wordKey).push(row);
    if (!rowsByLemma.has(lemmaKey)) rowsByLemma.set(lemmaKey, []);
    rowsByLemma.get(lemmaKey).push(row);
  }

  const storedByWordId = new Map();
  if (rows.length) {
    const wordIds = [...new Set(rows.map((row) => row.id))];
    for (const entry of await repositories.translations.listWordTranslationsForWords(targetLanguage, wordIds)) {
      storedByWordId.set(entry.wordId, normalizeName(entry.translation || ""));
    }
  }

  const resolved = new Map();
  for (const [key, token] of uniqueTokens) {
    const surfaceKey = String(token.surface || "").toLowerCase();
    const matches = new Map();
    for (const row of rowsByWord.get(surfaceKey) || []) matches.set(row.id, row);
    for (const row of rowsByLemma.get(key) || []) matches.set(row.id, row);
    const existing = matches.size ? pickPreferredWordMatch(matches.values(), surfaceKey) : null;
    if (existing && storedByWordId.has(existing.id)) {
      const stored = storedByWordId.get(existing.id);
      if (stored && stored.toLowerCase() !== token.lemma.toLowerCase() && stored.toLowerCase() !== surfaceKey) {
        continue;
      }
    }
    resolved.set(key, await lookupTranslation(repositories, sourceLanguage, targetLanguage, token.lemma));
  }
  return resolved;
}

/**
 * Schedule a translation backfill for a material on the next event loop tick
 * (via `setTimeout(..., 0)`) so it does not block the current request.
 * Errors are logged and swallowed.
 * @param {object} repositories
 * @param {number} userId
 * @param {number} materialId
 * @param {string} activeTargetLanguage - Language to skip (already being filled).
 */
export function scheduleMaterialTranslationBackfill(repositories, userId, materialId, activeTargetLanguage) {
  setTimeout(() => {
    backfillMaterialTranslations(repositories, userId, materialId, activeTargetLanguage).catch((error) => {
      console.error(`Translation backfill failed for material ${materialId}:`, error);
    });
  }, 0);
}

/**
 * Fill missing or stale translations for all supported target languages of a
 * material, skipping `activeTargetLanguage` (already written during import).
 * Runs in a single transaction; no-ops when the material does not exist.
 * @param {object} repositories
 * @param {number} userId
 * @param {number} materialId
 * @param {string} [activeTargetLanguage=""]
 * @returns {Promise<{ updated: number }>}
 */
export async function backfillMaterialTranslations(repositories, userId, materialId, activeTargetLanguage = "") {
  const material = await repositories.materials.findById(Number(materialId), userId);
  if (!material) {
    return { updated: 0 };
  }

  const sourceLanguage = { id: material.languageId, name: material.languageName };
  const targets = translationTargetsForLanguage(sourceLanguage).filter((target) => target !== activeTargetLanguage);
  return backfillMaterialTranslationTargets(repositories, material, sourceLanguage, targets);
}

async function backfillMaterialTranslationTargets(repositories, material, sourceLanguage, targets) {
  if (!targets.length) {
    return { updated: 0 };
  }

  const tokensByWord = new Map();
  for (const token of await repositories.translations.listMaterialTranslationTokens(material.id)) {
    if (!tokensByWord.has(token.wordId)) {
      tokensByWord.set(token.wordId, token);
    }
  }

  let updated = 0;
  await repositories.database.transaction(async (tx) => {
    for (const target of targets) {
      for (const token of tokensByWord.values()) {
        const stored = await getStoredTranslation(tx, token.wordId, target);
        const attempted = await hasTranslationAttempt(tx, token.wordId, target);
        const translation = await displayTranslationForToken(tx, sourceLanguage, target, token);
        if (stored && (!translation || stored === translation)) {
          continue;
        }
        if (!translation && attempted) {
          continue;
        }
        await tx.translations.upsertWordTranslation(token.wordId, target, translation);
        updated += 1;
      }
    }
  });

  return { updated };
}

/**
 * Fill missing translations in `targetLanguage` for every material belonging
 * to `userId`. Used when the user changes their native language so that all
 * existing materials get translations for the new language.
 * @param {object} repositories
 * @param {number} userId
 * @param {string} targetLanguage
 * @returns {Promise<{ updated: number }>}
 */
export async function backfillUserTranslations(repositories, userId, targetLanguage) {
  const target = languageKey(targetLanguage);
  if (!target) {
    return { updated: 0 };
  }

  let updated = 0;
  for (const material of await repositories.materials.listByUser(userId)) {
    const sourceLanguage = { id: material.languageId, name: material.languageName };
    if (!translationRoute(sourceLanguage, target)) {
      continue;
    }
    updated += (await backfillMaterialTranslationTargets(repositories, material, sourceLanguage, [target])).updated;
  }
  return { updated };
}

/**
 * Return the translation completion status for a material in the given target
 * language. A material whose source language equals the target is always
 * considered ready (no translation needed). Otherwise computes `totalWords`,
 * `completedWords`, `missingWords`, and `ready`.
 * @param {object} repositories
 * @param {object} material - Material row with `languageName`.
 * @param {string} targetLanguage
 * @returns {Promise<{ targetLanguage: string, ready: boolean, totalWords: number,
 *   completedWords: number, missingWords: number }>}
 */
export async function materialTranslationStatus(repositories, material, targetLanguage) {
  const target = languageKey(targetLanguage);
  if (!material || !target) {
    return { targetLanguage: target, ready: false, totalWords: 0, completedWords: 0, missingWords: 0 };
  }
  if (languageKey(material.languageName) === target) {
    return { targetLanguage: target, ready: true, totalWords: 0, completedWords: 0, missingWords: 0 };
  }

  const status = await repositories.translations.getMaterialTranslationStatus(target, material.id);
  const totalWords = Number(status?.totalWords || 0);
  const completedWords = Number(status?.completedWords || 0);
  return {
    targetLanguage: target,
    ready: completedWords >= totalWords,
    totalWords,
    completedWords,
    missingWords: Math.max(totalWords - completedWords, 0)
  };
}
