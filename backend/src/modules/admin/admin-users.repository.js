/**
 * @fileoverview Admin users repository. SQL persistence for the Users panel:
 * keyset-paginated user listing (with effective material counts resolved in a
 * single grouped query to avoid N+1) and the per-user material-limit override
 * mutation. Reads/writes the `users` table and reads `materials`.
 */

/**
 * Build the admin-users repository bound to the given database executor.
 *
 * @param {object} db - Prepared-statement executor (same interface as the other repositories).
 * @returns {object} Repository with user-listing and override-mutation methods.
 */
export function createAdminUsersRepository(db) {
  // Columns returned for every listed user. Material count is computed with a
  // single LEFT JOIN + GROUP BY so the page costs one query regardless of size.
  const userColumns = `
    u.id,
    u.email,
    u.created_at AS "createdAt",
    u.is_admin AS "isAdmin",
    u.is_superadmin AS "isSuperadmin",
    u.max_materials AS "maxMaterialsOverride",
    u.max_upload_bytes AS "maxUploadBytesOverride",
    COUNT(m.id)::int AS "materialCount"
  `;

  // Four keyset variants: two sort orders, each with an optional "after cursor"
  // clause. The cursor compares on the (sort key, id) tuple so ordering is
  // total and stable even when emails or timestamps collide.
  const buildList = (sort, withCursor) => {
    const dateFilter = "($1::timestamptz IS NULL OR u.created_at >= $1)";
    const searchFilter = "($2::text IS NULL OR u.email ILIKE '%' || $2 || '%')";
    const where = [dateFilter, searchFilter];
    let cursorClause = "";
    // $3/$4 carry the previous page's last (sortKey, id); $5 is the page limit.
    if (withCursor) {
      cursorClause = sort === "created_at"
        ? "AND (u.created_at, u.id) > ($3::timestamptz, $4::int)"
        : "AND (lower(u.email), u.id) > (lower($3::text), $4::int)";
    }
    const orderBy = sort === "created_at"
      ? "ORDER BY u.created_at ASC, u.id ASC"
      : "ORDER BY lower(u.email) ASC, u.id ASC";
    const limitParam = withCursor ? "$5" : "$3";
    return db.prepare(`
      SELECT ${userColumns}
      FROM users u
      LEFT JOIN materials m ON m.user_id = u.id
      WHERE ${where.join(" AND ")} ${cursorClause}
      GROUP BY u.id
      ${orderBy}
      LIMIT ${limitParam}
    `);
  };

  const listByEmail = buildList("email", false);
  const listByEmailAfter = buildList("email", true);
  const listByCreated = buildList("created_at", false);
  const listByCreatedAfter = buildList("created_at", true);

  const findUser = db.prepare(`
    SELECT
      u.id,
      u.email,
      u.is_admin AS "isAdmin",
      u.is_superadmin AS "isSuperadmin",
      u.max_materials AS "maxMaterialsOverride",
      u.max_upload_bytes AS "maxUploadBytesOverride"
    FROM users u
    WHERE u.id = ?
  `);

  const updateLimits = db.prepare(
    "UPDATE users SET max_materials = ?, max_upload_bytes = ? WHERE id = ?"
  );

  return {
    /**
     * Return one keyset page of users for the Users panel, each row annotated
     * with its material count via a single grouped query (no N+1).
     * Queries: `users` LEFT JOIN `materials`.
     *
     * @param {object} params
     * @param {"email"|"created_at"} params.sort - Sort key; defaults to email order.
     * @param {string|null} params.search - Case-insensitive email substring, or null.
     * @param {string|null} params.createdAfter - ISO timestamp lower bound on
     *   account creation date, or null for no filter.
     * @param {{ value: string, id: number }|null} params.cursor - The previous
     *   page's last (sortKey, id) tuple, or null for the first page.
     * @param {number} params.limit - Maximum rows to return.
     * @returns {Promise<object[]>}
     */
    listUsers({ sort, search, createdAfter, cursor, limit }) {
      const byCreated = sort === "created_at";
      if (cursor) {
        const statement = byCreated ? listByCreatedAfter : listByEmailAfter;
        return statement.all(createdAfter, search, cursor.value, cursor.id, limit);
      }
      const statement = byCreated ? listByCreated : listByEmail;
      return statement.all(createdAfter, search, limit);
    },
    /**
     * Fetch the limit-relevant fields for a single user (admin status and the
     * two override columns), used to authorise edits and audit before/after.
     * Queries: `users`.
     *
     * @param {number} userId
     * @returns {Promise<object|undefined>}
     */
    findUserForLimits(userId) {
      return findUser.get(userId);
    },
    /**
     * Set or clear the two per-user material-limit overrides. Pass `null` for a
     * column to clear it (reverting that limit to the global default).
     * Updates: `users`.
     *
     * @param {number} userId
     * @param {number|null} maxMaterials
     * @param {number|null} maxUploadBytes
     * @returns {Promise<{changes: number, lastInsertRowid: number|undefined}>}
     */
    setUserLimits(userId, maxMaterials, maxUploadBytes) {
      return updateLimits.run(maxMaterials, maxUploadBytes, userId);
    }
  };
}
