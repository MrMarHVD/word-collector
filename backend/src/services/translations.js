import { normalizeName } from "../shared/normalize.js";
import { lookupChineseEnglish, lookupChineseJapanese, lookupEnglishChinese, lookupEnglishJapanese, lookupJapaneseChinese, lookupJapaneseEnglish } from "./jmdict.js";

export const TRANSLATION_ROUTES = [
  { source: "English", target: "English", lookup: (_db, term) => term },
  { source: "English", target: "Japanese", lookup: lookupEnglishJapanese },
  { source: "English", target: "Chinese", lookup: lookupEnglishChinese },
  { source: "Japanese", target: "English", lookup: lookupJapaneseEnglish },
  { source: "Japanese", target: "Japanese", lookup: (_db, term) => term },
  { source: "Japanese", target: "Chinese", lookup: lookupJapaneseChinese },
  { source: "Chinese", target: "English", lookup: lookupChineseEnglish },
  { source: "Chinese", target: "Japanese", lookup: lookupChineseJapanese },
  { source: "Chinese", target: "Chinese", lookup: (_db, term) => term }
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

export function lookupTranslation(db, sourceLanguage, targetLanguage, term) {
  const route = translationRoute(sourceLanguage, targetLanguage);
  return route ? normalizeName(route.lookup(db, term)) : "";
}

export function supportedTargetNativeLanguage(sourceLanguage, nativeLanguage) {
  if (translationRoute(sourceLanguage, nativeLanguage)) return nativeLanguage;
  if (translationRoute(sourceLanguage, "English")) return "English";
  return "";
}

export function getStoredTranslation(statements, wordId, nativeLanguage) {
  return normalizeName(statements.wordTranslation.get(wordId, nativeLanguage)?.translation || "");
}

export function hasTranslationAttempt(statements, wordId, nativeLanguage) {
  return Boolean(statements.wordTranslation.get(wordId, nativeLanguage));
}

export function hasUsableStoredTranslation(statements, wordId, nativeLanguage, token) {
  const stored = getStoredTranslation(statements, wordId, nativeLanguage);
  if (!stored) return false;
  return stored.toLowerCase() !== token.lemma.toLowerCase() && stored.toLowerCase() !== token.surface.toLowerCase();
}

export function translationForToken(db, sourceLanguage, targetLanguage, token, translations = new Map()) {
  const stored = translations.get(token.lemma.toLowerCase()) || "";
  if (stored) return stored;
  return lookupTranslation(db, sourceLanguage, targetLanguage, token.surface);
}

export function getTranslationCandidates(db, statements, userId, sourceLanguage, targetLanguage, tokens) {
  if (!translationRoute(sourceLanguage, targetLanguage)) {
    return new Map();
  }

  const candidates = new Map();
  for (const token of tokens) {
    const key = token.lemma.toLowerCase();
    if (candidates.has(key)) {
      continue;
    }
    const existing = statements.wordInLanguageBySurfaceOrLemma.get(userId, sourceLanguage.id, token.surface, token.lemma, token.surface);
    if (existing && hasUsableStoredTranslation(statements, existing.id, targetLanguage, token)) {
      continue;
    }
    candidates.set(key, token.lemma);
  }

  return new Map(
    [...candidates.values()].map((lemma) => {
      const translation = lookupTranslation(db, sourceLanguage, targetLanguage, lemma);
      return [lemma.toLowerCase(), translation];
    })
  );
}

export function scheduleMaterialTranslationBackfill(db, statements, userId, materialId, activeTargetLanguage) {
  setTimeout(() => {
    try {
      backfillMaterialTranslations(db, statements, userId, materialId, activeTargetLanguage);
    } catch (error) {
      console.error(`Translation backfill failed for material ${materialId}:`, error);
    }
  }, 0);
}

function materialTranslationTokens(db, materialId) {
  return db.prepare(`
    SELECT mt.word_id AS wordId, mt.surface, mt.lemma
    FROM material_tokens mt
    WHERE mt.material_id = ?
    ORDER BY mt.position
  `).all(materialId);
}

export function backfillMaterialTranslations(db, statements, userId, materialId, activeTargetLanguage = "") {
  const material = statements.materialById.get(Number(materialId), userId);
  if (!material) {
    return { updated: 0 };
  }

  const sourceLanguage = { id: material.languageId, name: material.languageName };
  const targets = translationTargetsForLanguage(sourceLanguage).filter((target) => target !== activeTargetLanguage);
  if (!targets.length) {
    return { updated: 0 };
  }

  const tokensByWord = new Map();
  for (const token of materialTranslationTokens(db, material.id)) {
    if (!tokensByWord.has(token.wordId)) {
      tokensByWord.set(token.wordId, token);
    }
  }

  let updated = 0;
  db.exec("BEGIN");
  try {
    for (const target of targets) {
      for (const token of tokensByWord.values()) {
        if (hasTranslationAttempt(statements, token.wordId, target)) {
          continue;
        }
        const translation = lookupTranslation(db, sourceLanguage, target, token.lemma) || lookupTranslation(db, sourceLanguage, target, token.surface);
        statements.upsertWordTranslation.run(token.wordId, target, translation);
        updated += 1;
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return { updated };
}

export function materialTranslationStatus(db, material, targetLanguage) {
  const target = languageKey(targetLanguage);
  if (!material || !target) {
    return { targetLanguage: target, ready: false, totalWords: 0, completedWords: 0, missingWords: 0 };
  }
  if (languageKey(material.languageName) === target) {
    return { targetLanguage: target, ready: true, totalWords: 0, completedWords: 0, missingWords: 0 };
  }

  const status = db.prepare(`
    SELECT COUNT(DISTINCT mt.word_id) AS totalWords,
           COUNT(DISTINCT wt.word_id) AS completedWords
    FROM material_tokens mt
    LEFT JOIN word_translations wt ON wt.word_id = mt.word_id AND wt.native_language = ?
    WHERE mt.material_id = ?
  `).get(target, material.id);
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
