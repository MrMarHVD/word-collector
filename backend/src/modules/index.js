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

export function createRepositories(db) {
  const repositories = {
    auth: createAuthRepository(db),
    dashboard: createDashboardRepository(db),
    database: createDatabaseRepository(db),
    dictionaries: createDictionariesRepository(db),
    languages: createLanguagesRepository(db),
    materials: createMaterialsRepository(db),
    practice: createPracticeRepository(db),
    translations: createTranslationsRepository(db),
    words: createWordsRepository(db)
  };
  repositories.imports = createImportsRepository(repositories);
  return repositories;
}
