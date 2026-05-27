import { normalizeName } from "../../shared/normalize.js";
import { lookupChineseEnglish, lookupChineseJapanese, lookupEnglishChinese, lookupEnglishJapanese, lookupJapaneseChinese, lookupJapaneseEnglish } from "../dictionaries/dictionaries.service.js";

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
  return [...new Set(TRANSLATION_ROUTES.filter((route) => route.source === source && route.target !== source).map((route) => route.target))];
}

export function lookupTranslation(repositories, sourceLanguage, targetLanguage, term) {
  const route = translationRoute(sourceLanguage, targetLanguage);
  return route ? normalizeName(route.lookup(repositories.dictionaries, term)) : "";
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
        if (hasTranslationAttempt(repositories, token.wordId, target)) {
          continue;
        }
        const translation = lookupTranslation(repositories, sourceLanguage, target, token.lemma) || lookupTranslation(repositories, sourceLanguage, target, token.surface);
        repositories.translations.upsertWordTranslation(token.wordId, target, translation);
        updated += 1;
      }
    }
  });

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
