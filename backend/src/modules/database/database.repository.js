export function createDatabaseRepository(db) {
  return {
    transaction(work) {
      db.exec("BEGIN");
      try {
        const result = work();
        db.exec("COMMIT");
        return result;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    }
  };
}
