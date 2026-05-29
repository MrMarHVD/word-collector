import pg from "pg";
import { DATABASE_URL } from "../config.js";

// One connection pool per process (the main server and each import worker
// thread create their own instance when they import this module).
export const pool = new pg.Pool({ connectionString: DATABASE_URL });

// Repositories were written against node:sqlite's `?` placeholders. Postgres
// uses positional `$1, $2, ...`, so translate on the way to the driver.
function toPositional(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

// An executor wraps a queryable (the pool or a checked-out client) and exposes a
// prepared-statement-like API matching the old node:sqlite call sites, plus a
// transaction helper. `prepare(sql)` is synchronous; the returned methods are
// async because the pg driver is.
export function makeExecutor(queryable, { client = null } = {}) {
  const executor = {
    prepare(sql) {
      const text = toPositional(sql);
      return {
        async get(...params) {
          const result = await queryable.query(text, params);
          return result.rows[0];
        },
        async all(...params) {
          const result = await queryable.query(text, params);
          return result.rows;
        },
        async run(...params) {
          const result = await queryable.query(text, params);
          // `lastInsertRowid` is populated when the statement uses RETURNING id.
          return { changes: result.rowCount, lastInsertRowid: result.rows?.[0]?.id };
        }
      };
    },
    // Run `work` inside a transaction. When this executor is already bound to a
    // transaction client, reuse it instead of opening a nested transaction.
    async transaction(work) {
      if (client) {
        return work(executor);
      }
      const connection = await pool.connect();
      const scoped = makeExecutor(connection, { client: connection });
      try {
        await connection.query("BEGIN");
        const result = await work(scoped);
        await connection.query("COMMIT");
        return result;
      } catch (error) {
        await connection.query("ROLLBACK");
        throw error;
      } finally {
        connection.release();
      }
    }
  };
  return executor;
}

// The default executor used by the application, backed by the pool.
export const db = makeExecutor(pool);
