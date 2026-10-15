import { beforeEach, describe, it, expect, vi } from 'vitest';
import { getReadinessState } from '../src/readiness';
import { getHealthStatus } from '../src/health';
import { prismaRead, prismaWrite } from '../src/db';
import { dbConnectionStatus } from '../src/metrics';

vi.mock('../src/db', () => ({
  prismaRead: {
    $queryRaw: vi.fn().mockResolvedValue([{}]),
  },
  prismaWrite: {
    $queryRaw: vi.fn().mockResolvedValue([{}]),
  },
}));

vi.mock('../src/scheduler/cron-scheduler', () => ({
  scheduler: {
    getHealthSummary: vi.fn().mockReturnValue({ status: 'healthy', jobs: [] }),
  },
}));

vi.mock('../src/indexer/indexer', () => ({
  getLastIndexedLedger: vi.fn().mockResolvedValue(0),
}));

vi.mock('../src/indexer/rpc', () => ({
  getLatestLedger: vi.fn().mockResolvedValue(0),
}));

vi.mock('../src/db/replicaGateway', () => ({
  measureReplicaLag: vi.fn().mockResolvedValue(0),
}));

describe('Health and Readiness dependency set alignment', () => {
  beforeEach(() => {
    vi.mocked(prismaRead.$queryRaw).mockResolvedValue([{}]);
    vi.mocked(prismaWrite.$queryRaw).mockResolvedValue([{}]);
  });

  it('asserts that /readyz and /health never disagree on the dependency set', async () => {
    const readinessState = getReadinessState();
    const healthStatus = await getHealthStatus(false);

    const readinessKeys = Object.keys(readinessState).sort();
    const healthKeys = Object.keys(healthStatus.dependencies).sort();

    // Mapping between readiness dependency names and health response dependency keys
    const readinessToHealthMap: Record<string, string> = {
      db: 'database',
      cache: 'cache',
      rpc: 'rpc',
      indexer: 'indexer',
      coldStorage: 'coldStorage',
      p2p: 'p2p',
      worker: 'worker',
    };

    const mappedReadinessKeys = readinessKeys.map((k) => readinessToHealthMap[k] || k).sort();

    expect(mappedReadinessKeys).toEqual(healthKeys);
  });

  it('reports a read-replica outage as degraded without hiding the healthy write primary', async () => {
    vi.mocked(prismaRead.$queryRaw).mockRejectedValue(new Error('read replica unavailable'));

    const health = await getHealthStatus(true);

    expect(health.dependencies.database.status).toBe('degraded');
    expect(health.dependencies.database.details).toMatchObject({
      readReplica: 'disconnected',
      writePrimary: 'connected',
    });
    expect((await dbConnectionStatus.get()).values[0]?.value).toBe(1);
  });

  it('reports a write-primary outage as unhealthy even when reads remain available', async () => {
    vi.mocked(prismaWrite.$queryRaw).mockRejectedValue(new Error('write primary unavailable'));

    const health = await getHealthStatus(true);

    expect(health.dependencies.database.status).toBe('unhealthy');
    expect(health.dependencies.database.details).toMatchObject({
      readReplica: 'connected',
      writePrimary: 'disconnected',
    });
    expect((await dbConnectionStatus.get()).values[0]?.value).toBe(0);
  });
});
