/**
 * @fileoverview Database repository. Thin wrapper that exposes the database
 * executor's transaction primitive to domain services. The callback receives a
 * transaction-scoped repository set rebuilt by the module index so all queries
 * in the callback share the same connection and commit/roll back atomically.
 */

/**
 * Build the database repository.
 *
 * @param {object} executor - Database executor from `backend/src/db/index.js`.
 * @param {function(object): object} rebuild - Factory that builds a full
 *   repository map from a scoped executor (used to create the transaction-local set).
 * @returns {{ transaction: function(function): Promise<any> }}
 */
export function createDatabaseRepository(executor, rebuild) {
  return {
    /**
     * Run `work` as an atomic database transaction. The callback receives a
     * transaction-scoped repository set whose queries all run on the same
     * connection and commit or roll back together.
     *
     * @param {function(object): Promise<any>} work - Async callback that
     *   receives the scoped repository map and returns a value.
     * @returns {Promise<any>} Resolves with the value returned by `work`.
     */
    transaction(work) {
      return executor.transaction((scoped) => work(rebuild(scoped)));
    }
  };
}
