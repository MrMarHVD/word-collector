/**
 * @fileoverview Admin repository. SQL persistence for the admin domain. In this
 * foundation issue it owns the append-only `admin_audit_log` table; feature
 * issues (ADM-002/003/004) extend it with their own queries.
 */

/**
 * Build the admin repository bound to the given database executor.
 *
 * @param {object} db - Prepared-statement executor (same interface as the other repositories).
 * @returns {object} Repository with audit-log persistence methods.
 */
export function createAdminRepository(db) {
  const insertAudit = db.prepare(
    "INSERT INTO admin_audit_log (actor_id, action, target, before_value, after_value) VALUES (?, ?, ?, ?, ?)"
  );

  return {
    /**
     * Append a single row to the admin audit log.
     * Inserts into: `admin_audit_log`.
     *
     * @param {number|null} actorId - Id of the acting user, or `null` when unattributable.
     * @param {string} action - Stable identifier of the action performed.
     * @param {string|null} target - Optional descriptor of the affected entity.
     * @param {string|null} before - JSON-serialised snapshot of state before the change.
     * @param {string|null} after - JSON-serialised snapshot of state after the change.
     * @returns {Promise<{changes: number, lastInsertRowid: number|undefined}>}
     */
    insertAuditEntry(actorId, action, target, before, after) {
      return insertAudit.run(actorId, action, target, before, after);
    }
  };
}
