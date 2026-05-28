import { normalizeName } from "../../shared/normalize.js";
import { lookupChineseEnglish, lookupChineseJapanese, lookupChineseJapaneseEntries, lookupEnglishChinese, lookupEnglishChineseEntries, lookupEnglishJapanese, lookupEnglishJapaneseEntries, lookupJapaneseChinese, lookupJapaneseChineseEntries, lookupJapaneseEnglish } from "../dictionaries/dictionaries.service.js";
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
  { source: "Chinese", target: "Chinese", lookup: (_dictionariesRepository, term) => term }
];

export function languageKey(language) {
  if (!language) return "";
  const name = typeof language === "string" ? language : language.name;
  const normalized = String(name || "").toLowerCase();
  if (normalized === "english") return "English";
  if (normalized === "japanese" || name === "日本語") return "Japanese";
  if (normalized === "chinese") return "Chinese";
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
  return [];
}

function candidateSourceTerms(sourceLanguage, token) {
  if (languageKey(sourceLanguage) === "English") {
    return tokenSourceTerms(token);
  }
  const surface = normalizeName(token.surface || token.word);
  const lemma = normalizeName(token.lemma || token.word || token.surface);
  return [surface, lemma].filter((term, index, terms) => term && terms.indexOf(term) === index);
}

export function translationDisambiguationCandidates(repositories, sourceLanguage, targetLanguage, token) {
  if (!translationRoute(sourceLanguage, targetLanguage)) {
    return [];
  }
  const candidates = [];
  const seen = new Set();
  for (const source of candidateSourceTerms(sourceLanguage, token)) {
    for (const entry of lookupDictionaryEntriesForRoute(repositories, sourceLanguage, targetLanguage, source)) {
      const key = `${source}\u0000${entry.translation.toLowerCase()}\u0000${entry.pos.toLowerCase()}`;
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
