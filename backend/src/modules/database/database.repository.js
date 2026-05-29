export function createDatabaseRepository(executor, rebuild) {
  return {
    // Run `work` as an atomic unit. The callback receives a transaction-scoped
    // repository set whose queries all run on the same connection, so they
    // commit or roll back together.
    transaction(work) {
      return executor.transaction((scoped) => work(rebuild(scoped)));
    }
  };
}
