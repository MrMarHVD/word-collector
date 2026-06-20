/**
 * @fileoverview Superadmin repository (ADM-004). SQL persistence for the
 * superadmin-only operations: looking up a target user by email, flipping the
 * `is_admin` flag, and reading the paginated `admin_audit_log`.
 *
 * The `is_superadmin` flag is intentionally never written here — it is settable
 * only via the provisioning script (ADM-001), so the highest privilege tier
 * cannot be self-granted or self-revoked through the API.
 */

/**
 * Build the superadmin repository bound to the given database executor.
 *
 * @param {object} db - Prepared-statement executor (same interface as the other repositories).
 * @returns {object} Repository with user-lookup, admin-flag, and audit-read methods.
 */
export function createAdminSuperadminRepository(db) {
  const findUserByEmail = db.prepare(
    `SELECT id, email, is_admin AS "isAdmin", is_superadmin AS "isSuperadmin" FROM users WHERE lower(email) = lower(?)`
  );
  const findUserById = db.prepare(
    `SELECT id, email, is_admin AS "isAdmin", is_superadmin AS "isSuperadmin" FROM users WHERE id = ?`
  );
  const setAdminFlag = db.prepare("UPDATE users SET is_admin = ? WHERE id = ?");
  const countAudit = db.prepare("SELECT count(*)::int AS count FROM admin_audit_log");
  const listAudit = db.prepare(
    `SELECT l.id, l.actor_id AS "actorId", a.email AS "actorEmail", l.action, l.target,
            l.before_value AS "before", l.after_value AS "after", l.created_at AS "createdAt"
       FROM admin_audit_log l
       LEFT JOIN users a ON a.id = l.actor_id
      ORDER BY l.id DESC
      LIMIT ? OFFSET ?`
  );

  return {
    /**
     * Find a user by case-insensitive email, returning only the fields needed
     * for grant/revoke decisions.
     * Queries: `users`.
     *
     * @param {string} email
     * @returns {Promise<{id: number, email: string, isAdmin: boolean, isSuperadmin: boolean}|undefined>}
     */
    findUserByEmail(email) {
      return findUserByEmail.get(email);
    },
    /**
     * Find a user by id, returning only the privilege fields.
     * Queries: `users`.
     *
     * @param {number} userId
     * @returns {Promise<{id: number, email: string, isAdmin: boolean, isSuperadmin: boolean}|undefined>}
     */
    findUserById(userId) {
      return findUserById.get(userId);
    },
    /**
     * Set a user's `is_admin` flag. Never touches `is_superadmin`.
     * Updates: `users`.
     *
     * @param {boolean} isAdmin
     * @param {number} userId
     * @returns {Promise<{changes: number, lastInsertRowid: number|undefined}>}
     */
    setAdminFlag(isAdmin, userId) {
      return setAdminFlag.run(isAdmin, userId);
    },
    /**
     * Total number of rows in the audit log (for pagination metadata).
     * Queries: `admin_audit_log`.
     *
     * @returns {Promise<number>}
     */
    async countAuditEntries() {
      const row = await countAudit.get();
      return row?.count ?? 0;
    },
    /**
     * Read one page of audit-log rows, newest first, joined with the actor's
     * email for display.
     * Queries: `admin_audit_log`, `users`.
     *
     * @param {number} limit
     * @param {number} offset
     * @returns {Promise<Array<object>>}
     */
    listAuditEntries(limit, offset) {
      return listAudit.all(limit, offset);
    }
  };
}
