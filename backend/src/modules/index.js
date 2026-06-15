/**
 * @fileoverview Module registry. Instantiates every domain repository and
 * wires them together with a shared database executor. The `imports`
 * repository is constructed last because it delegates to other repositories
 * rather than holding its own prepared statements.
 */

import { createAuthRepository } from "./auth/auth.repository.js";
import { createDashboardRepository } from "./dashboard/dashboard.repository.js";
import { createDatabaseRepository } from "./database/database.repository.js";
import { createDictionariesRepository } from "./dictionaries/dictionaries.repository.js";
import { createImportsRepository } from "./imports/imports.repository.js";
import { createLanguagesRepository } from "./languages/languages.repository.js";
import { createMaterialsRepository } from "./materials/materials.repository.js";
import { createPracticeRepository } from "./practice/practice.repository.js";
import { createTranslationsRepository } from "./translations/translations.repository.js";
import { createWordsRepository } from "./words/words.repository.js";

/**
 * Instantiate all domain repositories and return them as a named map.
 *
 * `repositories.database` exposes a `transaction()` helper that rebuilds a
 * fresh repository set bound to the transaction connection, so every query in
 * the callback commits or rolls back atomically.
 *
 * @param {object} executor - A database executor produced by `backend/src/db/index.js`.
 * @returns {{ auth, dashboard, dictionaries, languages, materials, practice,
 *   translations, words, imports, database }} The wired repository map.
 */
export function createRepositories(executor) {
  const repositories = {
    auth: createAuthRepository(executor),
    dashboard: createDashboardRepository(executor),
    dictionaries: createDictionariesRepository(executor),
    languages: createLanguagesRepository(executor),
    materials: createMaterialsRepository(executor),
    practice: createPracticeRepository(executor),
    translations: createTranslationsRepository(executor),
    words: createWordsRepository(executor)
  };
  repositories.imports = createImportsRepository(repositories);
  // Transactions rebuild a repository set bound to the transaction connection.
  repositories.database = createDatabaseRepository(executor, (scoped) => createRepositories(scoped));
  return repositories;
}
