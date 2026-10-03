/**
 * @fileoverview Categories service. Business logic for user-defined work
 * categories: listing with counts, create, rename, reorder and delete.
 * Categories are owned by a user and scoped to a study language; ownership is
 * enforced by returning `null` for categories the user does not own.
 *
 * Coordinates with: categories repository, languages repository, database
 * repository (transaction).
 */

import { normalizeName } from "../../shared/normalize.js";

const MAX_CATEGORY_NAME_LENGTH = 60;
const PG_UNIQUE_VIOLATION = "23505";

/**
 * Validate and normalise a category name.
 * @param {unknown} value
 * @returns {{ name: string }|{ error: string, errorKey: string, status: 400 }}
 */
function validateCategoryName(value) {
  const name = normalizeName(value);
  if (!name) {
    return { error: "Category name is required.", errorKey: "errors.categoryNameRequired", status: 400 };
  }
  if (name.length > MAX_CATEGORY_NAME_LENGTH) {
    return { error: `Category names can be at most ${MAX_CATEGORY_NAME_LENGTH} characters.`, errorKey: "errors.categoryNameTooLong", status: 400, details: { max: MAX_CATEGORY_NAME_LENGTH } };
  }
  return { name };
}

/**
 * Run a category write and translate a unique-name violation into a 409 descriptor.
 * @param {function(): Promise<any>} write
 * @returns {Promise<{ error: string, errorKey: string, status: 409 }|null>} Error descriptor, or `null` on success.
 */
async function withNameConflict(write) {
  try {
    await write();
    return null;
  } catch (error) {
    if (error?.code === PG_UNIQUE_VIOLATION) {
      return { error: "A category with this name already exists.", errorKey: "errors.categoryNameTaken", status: 409 };
    }
    throw error;
  }
}

/**
 * List a user's categories for a language with work counts.
 * @param {object} repositories
 * @param {number} userId
 * @param {number} languageId
 * @returns {Promise<{ categories: object[], totalCount: number, uncategorisedCount: number }>}
 */
export async function listCategories(repositories, userId, languageId) {
  const categories = await repositories.categories.listByUserAndLanguage(userId, languageId);
  const { totalCount, uncategorisedCount } = await repositories.categories.countMaterials(userId, languageId);
  return {
    categories: categories.map(({ id, name, position, materialCount }) => ({ id, name, position, materialCount })),
    totalCount,
    uncategorisedCount
  };
}

/**
 * Create a category at the end of the user's list for a language.
 * @param {object} repositories
 * @param {number} userId
 * @param {number} languageId - Must already be verified as the user's language.
 * @param {unknown} rawName
 * @returns {Promise<{ category: object }|{ error: string, errorKey: string, status: number }>}
 */
export async function createCategory(repositories, userId, languageId, rawName) {
  const validated = validateCategoryName(rawName);
  if (validated.error) {
    return validated;
  }
  let id;
  const conflict = await withNameConflict(async () => {
    id = (await repositories.categories.create(userId, languageId, validated.name)).id;
  });
  if (conflict) {
    return conflict;
  }
  return { category: toCategory(await repositories.categories.findById(id, userId)) };
}

/**
 * Rename a category.
 * @param {object} repositories
 * @param {number} userId
 * @param {number} categoryId
 * @param {unknown} rawName
 * @returns {Promise<{ category: object }|{ error: string, errorKey: string, status: number }|null>}
 *   `null` when the category does not exist or is not owned by the user.
 */
export async function renameCategory(repositories, userId, categoryId, rawName) {
  if (!(await repositories.categories.findById(categoryId, userId))) {
    return null;
  }
  const validated = validateCategoryName(rawName);
  if (validated.error) {
    return validated;
  }
  const conflict = await withNameConflict(() => repositories.categories.rename(validated.name, categoryId, userId));
  if (conflict) {
    return conflict;
  }
  return { category: toCategory(await repositories.categories.findById(categoryId, userId)) };
}

/**
 * Persist a new category order. `ids` must be exactly the user's categories
 * for the language (no missing, extra or duplicate ids). Runs in one transaction.
 * @param {object} repositories
 * @param {number} userId
 * @param {number} languageId - Must already be verified as the user's language.
 * @param {unknown} ids
 * @returns {Promise<{ categories: object[] }|{ error: string, errorKey: string, status: 400 }>}
 */
export async function reorderCategories(repositories, userId, languageId, ids) {
  const existing = await repositories.categories.listIds(userId, languageId);
  const valid = Array.isArray(ids)
    && ids.every((id) => Number.isInteger(id))
    && new Set(ids).size === ids.length
    && ids.length === existing.length
    && ids.every((id) => existing.includes(id));
  if (!valid) {
    return { error: "The category order must list exactly your categories for this language.", errorKey: "errors.categoryOrderInvalid", status: 400 };
  }
  await repositories.database.transaction(async (scoped) => {
    for (const [position, id] of ids.entries()) {
      await scoped.categories.updatePosition(position, id, userId);
    }
  });
  return { categories: (await listCategories(repositories, userId, languageId)).categories };
}

/**
 * Delete a category; its works become uncategorised.
 * @param {object} repositories
 * @param {number} userId
 * @param {number} categoryId
 * @returns {Promise<boolean>} `false` when the category does not exist or is not owned by the user.
 */
export async function deleteCategory(repositories, userId, categoryId) {
  const result = await repositories.categories.deleteById(categoryId, userId);
  return Boolean(result.changes);
}

/**
 * Project a stored category row to its API shape.
 * @param {object} row
 * @returns {{ id: number, name: string, position: number }}
 */
function toCategory({ id, name, position }) {
  return { id, name, position };
}
