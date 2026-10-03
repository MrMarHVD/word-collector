/**
 * @fileoverview Categories repository. SQL persistence for user-defined work
 * categories, scoped per user and study language. Tables: `categories`,
 * `materials` (for per-category and uncategorised counts).
 */

/**
 * Build the categories repository bound to the given database executor.
 *
 * @param {object} db - Prepared-statement executor.
 * @returns {object} Repository with category persistence and count methods.
 */
export function createCategoriesRepository(db) {
  const categoryColumns = `c.id, c.language_id AS "languageId", c.name, c.position`;
  const listCategories = db.prepare(`
    SELECT ${categoryColumns}, COUNT(m.id)::int AS "materialCount"
    FROM categories c
    LEFT JOIN materials m ON m.category_id = c.id
    WHERE c.user_id = ? AND c.language_id = ?
    GROUP BY c.id
    ORDER BY c.position, c.id
  `);
  const categoryById = db.prepare(`
    SELECT ${categoryColumns}, c.user_id AS "userId"
    FROM categories c
    WHERE c.id = ? AND c.user_id = ?
  `);
  const insertCategory = db.prepare(`
    INSERT INTO categories (user_id, language_id, name, position)
    VALUES (?, ?, ?, (SELECT COALESCE(MAX(position) + 1, 0) FROM categories WHERE user_id = ? AND language_id = ?))
    RETURNING id
  `);
  const renameCategory = db.prepare("UPDATE categories SET name = ? WHERE id = ? AND user_id = ?");
  const deleteCategory = db.prepare("DELETE FROM categories WHERE id = ? AND user_id = ?");
  const updateCategoryPosition = db.prepare("UPDATE categories SET position = ? WHERE id = ? AND user_id = ?");
  const listCategoryIds = db.prepare("SELECT id FROM categories WHERE user_id = ? AND language_id = ? ORDER BY position, id");
  const countMaterials = db.prepare(`
    SELECT COUNT(*)::int AS "totalCount",
           COUNT(*) FILTER (WHERE category_id IS NULL)::int AS "uncategorisedCount"
    FROM materials
    WHERE user_id = ? AND language_id = ?
  `);

  return {
    /**
     * List the user's categories for a language in display order, with the
     * number of works in each.
     * Queries: `categories` LEFT JOIN `materials`.
     * @param {number} userId
     * @param {number} languageId
     * @returns {object[]} Rows with `id`, `languageId`, `name`, `position`, `materialCount`.
     */
    listByUserAndLanguage(userId, languageId) {
      return listCategories.all(userId, languageId);
    },
    /**
     * Find a category owned by the user.
     * Queries: `categories`.
     * @param {number} categoryId
     * @param {number} userId
     * @returns {object|undefined} Row with `id`, `languageId`, `name`, `position`, `userId`.
     */
    findById(categoryId, userId) {
      return categoryById.get(categoryId, userId);
    },
    /**
     * Insert a category at the end of the user's list for the language.
     * Inserts into: `categories`. Throws a unique violation on a
     * case-insensitive duplicate name.
     * @param {number} userId
     * @param {number} languageId
     * @param {string} name
     * @returns {object} Row with the new `id`.
     */
    create(userId, languageId, name) {
      return insertCategory.get(userId, languageId, name, userId, languageId);
    },
    /**
     * Rename a category. Throws a unique violation on a case-insensitive duplicate.
     * Updates: `categories`.
     * @param {string} name
     * @param {number} categoryId
     * @param {number} userId
     * @returns {object} Run result.
     */
    rename(name, categoryId, userId) {
      return renameCategory.run(name, categoryId, userId);
    },
    /**
     * Delete a category. Its materials become uncategorised (FK SET NULL).
     * Deletes from: `categories`.
     * @param {number} categoryId
     * @param {number} userId
     * @returns {object} Run result.
     */
    deleteById(categoryId, userId) {
      return deleteCategory.run(categoryId, userId);
    },
    /**
     * Return the ids of the user's categories for a language in display order.
     * Queries: `categories`.
     * @param {number} userId
     * @param {number} languageId
     * @returns {Promise<number[]>}
     */
    async listIds(userId, languageId) {
      return (await listCategoryIds.all(userId, languageId)).map((row) => row.id);
    },
    /**
     * Set a category's display position.
     * Updates: `categories`.
     * @param {number} position
     * @param {number} categoryId
     * @param {number} userId
     * @returns {object} Run result.
     */
    updatePosition(position, categoryId, userId) {
      return updateCategoryPosition.run(position, categoryId, userId);
    },
    /**
     * Count the user's works for a language: all, and those with no category.
     * Queries: `materials`.
     * @param {number} userId
     * @param {number} languageId
     * @returns {{ totalCount: number, uncategorisedCount: number }}
     */
    countMaterials(userId, languageId) {
      return countMaterials.get(userId, languageId);
    }
  };
}
