import { db, pool } from "../src/db/index.js";
import { createRepositories } from "../src/modules/index.js";
import { displayTranslationForToken, languageKey, translationTargetsForLanguage } from "../src/modules/translations/translations.service.js";

// One-off backfill to run once, immediately after the global-languages-words
// migration. For every word that is now shared by two or more users, regenerate
// its translation against the current dictionary logic so all of those users
// see one consistent, up-to-date translation (the migration only carries the
// best pre-existing translation forward as a placeholder).
//
// Words used by a single user are left untouched: there is no one to reconcile
// with, and their owner's translation is preserved as-is.
//
// Idempotent and read-mostly: re-running it simply recomputes the same values.
// Run migrations first (`npm run migrate:up`); this assumes the new schema.
// Usage: npm run backfill:global-translations

const repositories = createRepositories(db);

const sharedWords = await db.prepare(`
  SELECT w.id, w.language_id AS "languageId", l.name AS "languageName",
         w.word, COALESCE(NULLIF(btrim(w.lemma), ''), w.word) AS lemma,
         w.pos, w.reading, w.pinyin, w.traditional
  FROM words w
  JOIN languages l ON l.id = w.language_id
  WHERE (SELECT COUNT(DISTINCT uw.user_id) FROM user_words uw WHERE uw.word_id = w.id) >= 2
  ORDER BY w.id
`).all();

let updated = 0;
try {
  for (const row of sharedWords) {
    const sourceLanguage = { id: row.languageId, name: row.languageName };
    const source = languageKey(sourceLanguage);
    const token = {
      surface: row.word,
      lemma: row.lemma,
      word: row.word,
      pos: row.pos || "",
      reading: row.reading || "",
      pinyin: row.pinyin || "",
      traditional: row.traditional || ""
    };

    // Regenerate every available native-language translation so each affected
    // user inherits the same value regardless of their native language.
    for (const target of translationTargetsForLanguage(sourceLanguage)) {
      if (languageKey(target) === source) {
        continue; // same-language route is the identity; nothing to store
      }
      const translation = await displayTranslationForToken(repositories, sourceLanguage, target, token);
      if (translation) {
        await repositories.translations.upsertWordTranslation(row.id, target, translation);
      }
    }

    // Refresh the English base gloss used as a display fallback.
    if (source !== "English") {
      const english = await displayTranslationForToken(repositories, sourceLanguage, "English", token);
      if (english) {
        await db.prepare("UPDATE words SET translation = ? WHERE id = ?").run(english, row.id);
      }
    }

    updated += 1;
  }
  console.log(`Re-translated ${updated} shared word(s) of ${sharedWords.length} candidate(s).`);
} finally {
  await pool.end();
}
