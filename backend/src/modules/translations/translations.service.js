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

export function translationRoute(sourceLanguage, targetLanguage) {
  const source = languageKey(sourceLanguage);
  const target = languageKey(targetLanguage);
  return TRANSLATION_ROUTES.find((route) => route.source === source && route.target === target) || null;
}

export function translationTargetsForLanguage(sourceLanguage) {
  const source = languageKey(sourceLanguage);
  return [...new Set(TRANSLATION_ROUTES.filter((route) => route.source === source).map((route) => route.target))];
}

export function lookupTranslation(repositories, sourceLanguage, targetLanguage, term) {
  const route = translationRoute(sourceLanguage, targetLanguage);
  return route ? normalizeName(route.lookup(repositories.dictionaries, term)) : "";
}

function tokenSourceTerms(token) {
  const surface = normalizeName(token.surface || token.word).toLowerCase();
  const lemma = normalizeName(token.lemma || token.word || token.surface).toLowerCase();
  const lemmatized = surface
    ? [lemmatizer.verb(surface), lemmatizer.noun(surface), lemmatizer.adjective(surface)]
    : [];
  return [surface, lemma, ...lemmatized].filter((term, index, terms) => term && terms.indexOf(term) === index);
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
  vont: ["aller"]
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

function lookupDictionaryEntriesForRoute(repositories, sourceLanguage, targetLanguage, term) {
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

export function translationDisambiguationCandidates(repositories, sourceLanguage, targetLanguage, token) {
  if (!translationRoute(sourceLanguage, targetLanguage)) {
    return [];
  }
  const candidates = [];
  const seen = new Set();
  for (const source of candidateSourceTerms(sourceLanguage, token)) {
    for (const entry of lookupDictionaryEntriesForRoute(repositories, sourceLanguage, targetLanguage, source)) {
      if (entry.translation.toLowerCase() === String(entry.source || source).toLowerCase()) continue;
      const key = `${entry.source || source}\u0000${entry.translation.toLowerCase()}\u0000${entry.pos.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ source: entry.source || source, translation: entry.translation, pos: entry.pos || "" });
    }
  }
  return candidates;
}

export function displayTranslationForToken(repositories, sourceLanguage, targetLanguage, token) {
  const candidates = translationDisambiguationCandidates(repositories, sourceLanguage, targetLanguage, token);
  if (candidates.length) {
    return candidates[0].translation;
  }
  return lookupTranslation(repositories, sourceLanguage, targetLanguage, token.lemma || token.word)
    || lookupTranslation(repositories, sourceLanguage, targetLanguage, token.surface || token.word);
}

export function supportedTargetNativeLanguage(sourceLanguage, nativeLanguage) {
  if (translationRoute(sourceLanguage, nativeLanguage)) return nativeLanguage;
  if (translationRoute(sourceLanguage, "English")) return "English";
  return "";
}

export function getStoredTranslation(repositories, wordId, nativeLanguage) {
  return normalizeName(repositories.translations.findWordTranslation(wordId, nativeLanguage)?.translation || "");
}

export function hasTranslationAttempt(repositories, wordId, nativeLanguage) {
  return Boolean(repositories.translations.findWordTranslation(wordId, nativeLanguage));
}

export function hasUsableStoredTranslation(repositories, wordId, nativeLanguage, token) {
  const stored = getStoredTranslation(repositories, wordId, nativeLanguage);
  if (!stored) return false;
  return stored.toLowerCase() !== token.lemma.toLowerCase() && stored.toLowerCase() !== token.surface.toLowerCase();
}

export function translationForToken(repositories, sourceLanguage, targetLanguage, token, translations = new Map()) {
  if (translationDisambiguationCandidates(repositories, sourceLanguage, targetLanguage, token).length) {
    return displayTranslationForToken(repositories, sourceLanguage, targetLanguage, token);
  }
  const stored = translations.get(token.lemma.toLowerCase()) || "";
  if (stored) return stored;
  return lookupTranslation(repositories, sourceLanguage, targetLanguage, token.surface);
}

export function getTranslationCandidates(repositories, userId, sourceLanguage, targetLanguage, tokens) {
  if (!translationRoute(sourceLanguage, targetLanguage)) {
    return new Map();
  }

  const candidates = new Map();
  for (const token of tokens) {
    const key = token.lemma.toLowerCase();
    if (candidates.has(key)) {
      continue;
    }
    const existing = repositories.words.findWordInLanguageBySurfaceOrLemma(userId, sourceLanguage.id, token.surface, token.lemma);
    if (existing && hasUsableStoredTranslation(repositories, existing.id, targetLanguage, token)) {
      continue;
    }
    candidates.set(key, token.lemma);
  }

  return new Map(
    [...candidates.values()].map((lemma) => {
      const translation = lookupTranslation(repositories, sourceLanguage, targetLanguage, lemma);
      return [lemma.toLowerCase(), translation];
    })
  );
}

export function scheduleMaterialTranslationBackfill(repositories, userId, materialId, activeTargetLanguage) {
  setTimeout(() => {
    try {
      backfillMaterialTranslations(repositories, userId, materialId, activeTargetLanguage);
    } catch (error) {
      console.error(`Translation backfill failed for material ${materialId}:`, error);
    }
  }, 0);
}

export function backfillMaterialTranslations(repositories, userId, materialId, activeTargetLanguage = "") {
  const material = repositories.materials.findById(Number(materialId), userId);
  if (!material) {
    return { updated: 0 };
  }

  const sourceLanguage = { id: material.languageId, name: material.languageName };
  const targets = translationTargetsForLanguage(sourceLanguage).filter((target) => target !== activeTargetLanguage);
  return backfillMaterialTranslationTargets(repositories, material, sourceLanguage, targets);
}

function backfillMaterialTranslationTargets(repositories, material, sourceLanguage, targets) {
  if (!targets.length) {
    return { updated: 0 };
  }

  const tokensByWord = new Map();
  for (const token of repositories.translations.listMaterialTranslationTokens(material.id)) {
    if (!tokensByWord.has(token.wordId)) {
      tokensByWord.set(token.wordId, token);
    }
  }

  let updated = 0;
  repositories.database.transaction(() => {
    for (const target of targets) {
      for (const token of tokensByWord.values()) {
        const stored = getStoredTranslation(repositories, token.wordId, target);
        const attempted = hasTranslationAttempt(repositories, token.wordId, target);
        const translation = displayTranslationForToken(repositories, sourceLanguage, target, token);
        if (stored && (!translation || stored === translation)) {
          continue;
        }
        if (!translation && attempted) {
          continue;
        }
        repositories.translations.upsertWordTranslation(token.wordId, target, translation);
        updated += 1;
      }
    }
  });

  return { updated };
}

export function backfillUserTranslations(repositories, userId, targetLanguage) {
  const target = languageKey(targetLanguage);
  if (!target) {
    return { updated: 0 };
  }

  let updated = 0;
  for (const material of repositories.materials.listByUser(userId)) {
    const sourceLanguage = { id: material.languageId, name: material.languageName };
    if (!translationRoute(sourceLanguage, target)) {
      continue;
    }
    updated += backfillMaterialTranslationTargets(repositories, material, sourceLanguage, [target]).updated;
  }
  return { updated };
}

export function materialTranslationStatus(repositories, material, targetLanguage) {
  const target = languageKey(targetLanguage);
  if (!material || !target) {
    return { targetLanguage: target, ready: false, totalWords: 0, completedWords: 0, missingWords: 0 };
  }
  if (languageKey(material.languageName) === target) {
    return { targetLanguage: target, ready: true, totalWords: 0, completedWords: 0, missingWords: 0 };
  }

  const status = repositories.translations.getMaterialTranslationStatus(target, material.id);
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
