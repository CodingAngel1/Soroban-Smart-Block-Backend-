import { Counter, Gauge, Histogram } from 'prom-client';
import { performance } from 'node:perf_hooks';
import type { PoolClient } from 'pg';
import { registry } from '../metrics';

interface PoolRegistration {
  pool: PostgresPool;
  max: number;
}

export interface PostgresPool {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
  connect(): Promise<PoolClient>;
}

const pools = new Map<string, Set<PoolRegistration>>();

export const postgresPoolConnections = new Gauge({
  name: 'postgres_pool_connections',
  help: 'PostgreSQL pool connections by pool and state (total or idle)',
  labelNames: ['pool', 'state'],
  registers: [registry],
});

export const postgresPoolWaitingClients = new Gauge({
  name: 'postgres_pool_waiting_clients',
  help: 'Number of clients waiting to acquire a PostgreSQL connection',
  labelNames: ['pool'],
  registers: [registry],
});

export const postgresPoolSaturationRatio = new Gauge({
  name: 'postgres_pool_saturation_ratio',
  help: 'Ratio of non-idle PostgreSQL connections to configured pool capacity',
  labelNames: ['pool'],
  registers: [registry],
});

export const postgresPoolWaitSeconds = new Histogram({
  name: 'postgres_pool_wait_seconds',
  help: 'Time spent waiting to acquire a PostgreSQL pool connection',
  labelNames: ['pool', 'outcome'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

export const postgresPoolWaitErrorsTotal = new Counter({
  name: 'postgres_pool_wait_errors_total',
  help: 'Failed attempts to acquire a PostgreSQL pool connection',
  labelNames: ['pool'],
  registers: [registry],
});

export function registerPostgresPool(name: string, pool: PostgresPool, max: number): () => void {
  const registration = { pool, max };
  const registrations = pools.get(name) ?? new Set<PoolRegistration>();
  registrations.add(registration);
  pools.set(name, registrations);
  collectPostgresPoolMetrics();

  return () => {
    registrations.delete(registration);
    if (registrations.size === 0) {
      pools.delete(name);
      postgresPoolConnections.remove({ pool: name, state: 'total' });
      postgresPoolConnections.remove({ pool: name, state: 'idle' });
      postgresPoolWaitingClients.remove({ pool: name });
      postgresPoolSaturationRatio.remove({ pool: name });
    } else {
      collectPostgresPoolMetrics();
    }
  };
}

export function collectPostgresPoolMetrics(): void {
  for (const [name, registrations] of pools) {
    let total = 0;
    let idle = 0;
    let waiting = 0;
    let capacity = 0;
    for (const { pool, max } of registrations) {
      total += pool.totalCount;
      idle += pool.idleCount;
      waiting += pool.waitingCount;
      capacity += max;
    }
    postgresPoolConnections.set({ pool: name, state: 'total' }, total);
    postgresPoolConnections.set({ pool: name, state: 'idle' }, idle);
    postgresPoolWaitingClients.set({ pool: name }, waiting);
    postgresPoolSaturationRatio.set(
      { pool: name },
      capacity > 0 ? Math.min(1, Math.max(0, total - idle) / capacity) : 0,
    );
  }
}

export async function acquirePostgresClient(
  poolName: string,
  pool: Pick<PostgresPool, 'connect'>,
): Promise<PoolClient> {
  const startedAt = performance.now();
  try {
    const client = await pool.connect();
    postgresPoolWaitSeconds.observe(
      { pool: poolName, outcome: 'acquired' },
      (performance.now() - startedAt) / 1000,
    );
    return client;
  } catch (error) {
    postgresPoolWaitSeconds.observe(
      { pool: poolName, outcome: 'error' },
      (performance.now() - startedAt) / 1000,
    );
    postgresPoolWaitErrorsTotal.inc({ pool: poolName });
    throw error;
  }
}
