/**
 * @fileoverview Admin service. Business logic for the admin domain. This
 * foundation issue establishes the shared `recordAudit` helper that the feature
 * issues (ADM-002/003/004) call whenever they mutate privileged state; it has no
 * caller yet by design.
 */

/**
 * Record a single privileged action in the admin audit log.
 *
 * This is the canonical audit-write contract for the admin feature: every
 * privileged mutation (user-limit changes, word/translation edits, grant/revoke)
 * passes through here so the trail is uniform. The `before`/`after` snapshots are
 * JSON-serialised before storage (stored in `JSONB` columns); pass `null`/`undefined`
 * for either when not applicable (e.g. a pure creation has no `before`).
 *
 * @param {object} repositories - The wired repository map (must include `admin`).
 * @param {{ userId: number }} actor - The authenticated user performing the action.
 * @param {string} action - Stable identifier of the action, e.g. `"user.setLimit"`.
 * @param {string|null} [target] - Optional descriptor of the affected entity,
 *   e.g. `"user:42"` or `"word:1337"`.
 * @param {unknown} [before] - State before the change; JSON-serialised, or stored
 *   as `null` when omitted.
 * @param {unknown} [after] - State after the change; JSON-serialised, or stored as
 *   `null` when omitted.
 * @returns {Promise<void>}
 */
export async function recordAudit(repositories, actor, action, target = null, before = undefined, after = undefined) {
  const serialise = (value) => (value === undefined || value === null ? null : JSON.stringify(value));
  await repositories.admin.insertAuditEntry(
    actor?.userId ?? null,
    action,
    target ?? null,
    serialise(before),
    serialise(after)
  );
}
