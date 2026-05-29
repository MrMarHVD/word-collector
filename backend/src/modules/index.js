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
