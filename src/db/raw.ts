/**
 * src/db/raw.ts
 *
 * Raw-SQL access for indexer-internal tables that have no Prisma model
 * (e.g. `adaptive_polling_state`). Prisma owns the domain tables; this module
 * only serves parameterized queries against the same database the Prisma
 * clients point at, so indexer state survives process restarts.
 *
 * Every call site must pass values as the second argument (`$1, $2, …`
 * placeholders) — string interpolation of user-influenced input is rejected
 * by design; see docs/security/sql-injection.md.
 */

import { Pool } from 'pg';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { config } from '../config';
import { logger } from '../logger';
import { acquirePostgresClient, registerPostgresPool } from './postgres-pool-metrics';

let pool: Pool | null = null;
let unregisterPoolMetrics: (() => void) | null = null;
const RAW_POOL_MAX = 5;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: config.databaseUrl,
      max: RAW_POOL_MAX,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    unregisterPoolMetrics = registerPostgresPool('raw', pool, RAW_POOL_MAX);
    // A pooled background client that idle-errors must not crash the process.
    pool.on('error', (err) => {
      logger.error(`[db/raw] idle client error: ${err.message}`);
    });
  }
  return pool;
}

/**
 * Run a parameterized raw-SQL statement.
 * Shape-compatible with the previous `db.query(sql, params)` call sites so the
 * indexer modules keep their call signature.
 */
export async function rawQuery<R extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<R>> {
  const client = await acquirePostgresClient('raw', getPool());
  try {
    return await client.query<R>(text, params as unknown[]);
  } finally {
    client.release();
  }
}

/**
 * Run a callback with a dedicated client (multi-statement transactions).
 */
export async function withRawClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await acquirePostgresClient('raw', getPool());
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

/**
 * Close the pool (graceful shutdown / tests).
 */
export async function closeRawPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    unregisterPoolMetrics?.();
    unregisterPoolMetrics = null;
  }
}
