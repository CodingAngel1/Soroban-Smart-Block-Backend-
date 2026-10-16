import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import {
  acquirePostgresClient,
  collectPostgresPoolMetrics,
  postgresPoolConnections,
  postgresPoolSaturationRatio,
  postgresPoolWaitErrorsTotal,
  postgresPoolWaitingClients,
  registerPostgresPool,
} from '../../src/db/postgres-pool-metrics';

const unregister: Array<() => void> = [];

afterEach(() => {
  unregister.splice(0).forEach((dispose) => dispose());
});

describe('PostgreSQL pool metrics', () => {
  it('exports aggregate pool state and a bounded saturation ratio', async () => {
    const pool = {
      totalCount: 5,
      idleCount: 1,
      waitingCount: 3,
      connect: vi.fn<() => Promise<PoolClient>>(),
    };
    unregister.push(registerPostgresPool('metrics-test', pool, 4));

    collectPostgresPoolMetrics();

    const connections = await postgresPoolConnections.get();
    const waiting = await postgresPoolWaitingClients.get();
    const saturation = await postgresPoolSaturationRatio.get();
    expect(connections.values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ labels: { pool: 'metrics-test', state: 'total' }, value: 5 }),
        expect.objectContaining({ labels: { pool: 'metrics-test', state: 'idle' }, value: 1 }),
      ]),
    );
    expect(waiting.values).toEqual([
      expect.objectContaining({ labels: { pool: 'metrics-test' }, value: 3 }),
    ]);
    expect(saturation.values).toEqual([
      expect.objectContaining({ labels: { pool: 'metrics-test' }, value: 1 }),
    ]);
  });

  it('records a failed connection acquisition and rethrows the failure', async () => {
    const pool = {
      connect: vi.fn<() => Promise<PoolClient>>().mockRejectedValue(new Error('pool exhausted')),
    };

    await expect(acquirePostgresClient('failure-test', pool)).rejects.toThrow('pool exhausted');
    const errors = await postgresPoolWaitErrorsTotal.get();
    expect(errors.values).toEqual([
      expect.objectContaining({ labels: { pool: 'failure-test' }, value: 1 }),
    ]);
  });
});
