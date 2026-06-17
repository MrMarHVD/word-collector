/**
 * @file backfill_global_translations.js
 * @description One-off follow-up script for migration `1748000000007_global-languages-words`.
 * For every word now shared by two or more users, regenerates its translation using the
 * current dictionary lookup logic so all affected users see a single, consistent,
 * up-to-date translation. The migration itself carries only the best pre-existing
 * translation forward as a placeholder.
 *
 * Words belonging to a single user are left untouched: there is nobody to reconcile
 * with, and the owner's stored translation is preserved as-is.
 *
 * The script is idempotent: re-running it recomputes and upserts the same values.
 * It is read-mostly — no rows are deleted and no user-owned data is altered.
 *
 * Prerequisites: run `npm run migrate:up` first; this script requires the schema
 * introduced by migration 007 (`user_words`, global `languages`, etc.).
 *
 * CLI usage:
 * ```
 * npm run backfill:global-translations
 * ```
 *
 * Database side effects:
 *  - Upserts rows in `word_translations` for all target native languages for each
 *    shared word.
 *  - Updates `words.translation` (the English base gloss) for shared non-English words.
 *
 * Exits with a summary line reporting how many words were re-translated.
 */
import { db, pool } from "../src/db/index.js";
import { createRepositories } from "../src/modules/index.js";
import { displayTranslationForToken, languageKey, translationTargetsForLanguage } from "../src/modules/translations/translations.service.js";

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
