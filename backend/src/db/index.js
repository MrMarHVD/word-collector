/**
 * @fileoverview PostgreSQL connection pool and query executor.
 *
 * Exports a singleton `pool` (one per process) and a default `db` executor
 * built on top of it.  {@link makeExecutor} wraps any `pg`-compatible queryable
 * (pool or checked-out client) with a `prepare`/`transaction` API that mirrors
 * the `node:sqlite` call sites used when the app ran on SQLite, translating `?`
 * placeholders to Postgres-style positional `$1, $2, …` parameters on the fly.
 *
 * Repositories call `db.prepare(sql).get(…)`, `.all(…)`, or `.run(…)` for
 * single-connection queries, and `db.transaction(async (tx) => { … })` to wrap
 * multiple statements in an atomic BEGIN/COMMIT block.
 */

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

/**
 * Creates an executor that wraps a `pg` queryable with a prepared-statement-like
 * interface and a transaction helper.
 *
 * `prepare(sql)` translates `?` placeholders to positional Postgres parameters
 * and returns an object with three async methods:
 * - `get(...params)` — runs the query and returns the first row or `undefined`.
 * - `all(...params)` — runs the query and returns all rows as an array.
 * - `run(...params)` — runs the query and returns `{ changes, lastInsertRowid }`.
 *   `lastInsertRowid` is populated only when the statement uses `RETURNING id`.
 *
 * `transaction(work)` checks out a client from the pool, wraps `work` in
 * BEGIN/COMMIT/ROLLBACK, and releases the client.  When the executor is already
 * bound to a transaction client (i.e. called recursively), `work` is called
 * directly without opening a nested transaction.
 *
 * @param {pg.Pool | pg.PoolClient} queryable - A pg pool or checked-out client.
 * @param {{ client?: pg.PoolClient | null }} [options]
 * @returns {{ prepare: (sql: string) => { get: (...params: unknown[]) => Promise<unknown>, all: (...params: unknown[]) => Promise<unknown[]>, run: (...params: unknown[]) => Promise<{changes: number, lastInsertRowid: number|undefined}> }, transaction: (work: (executor: ReturnType<typeof makeExecutor>) => Promise<unknown>) => Promise<unknown> }}
 */
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
