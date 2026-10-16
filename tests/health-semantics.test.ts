import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryRead, queryWrite, getRpcTip, readiness } = vi.hoisted(() => ({
  queryRead: vi.fn(),
  queryWrite: vi.fn(),
  getRpcTip: vi.fn(),
  readiness: {
    current: {
      db: true,
      cache: true,
      rpc: true,
      indexer: true,
      coldStorage: true,
      p2p: true,
      worker: true,
    },
  },
}));

vi.mock('../src/db', () => ({
  prismaRead: { $queryRaw: queryRead },
  prismaWrite: { $queryRaw: queryWrite },
}));
vi.mock('../src/cache', () => ({
  isCacheReady: vi.fn().mockReturnValue(true),
  cacheBackendType: vi.fn().mockReturnValue('redis'),
  pingRedis: vi.fn().mockResolvedValue(true),
}));
vi.mock('../src/indexer-state', () => ({
  getIndexerStatus: vi.fn().mockReturnValue({ healthy: true }),
}));
vi.mock('../src/readiness', () => ({
  getReadinessState: () => ({ ...readiness.current }),
  markReady: vi.fn(),
  markNotReady: vi.fn(),
}));
vi.mock('../src/p2p', () => ({
  isP2pEnabled: vi.fn().mockReturnValue(false),
  getConnectedPeerCount: vi.fn().mockReturnValue(0),
}));
vi.mock('../src/indexer/rpc', () => ({ getLatestLedger: getRpcTip }));
vi.mock('../src/indexer/indexer', () => ({
  getLastIndexedLedger: vi.fn().mockResolvedValue(1000),
}));
vi.mock('../src/db/replicaGateway', () => ({
  measureReplicaLag: vi.fn().mockResolvedValue(0),
}));
vi.mock('../src/indexer/fee-aggregator', () => ({
  getStalenessStatus: vi.fn().mockReturnValue({ stale: false }),
  isFeeAggregationStale: vi.fn().mockReturnValue(false),
}));
vi.mock('../src/indexer/gasAnalyticsEngine', () => ({
  getGasAnalyticsStalenessStatus: vi.fn().mockReturnValue({ stale: false }),
  isGasAnalyticsStale: vi.fn().mockReturnValue(false),
}));
vi.mock('../src/scheduler/cron-scheduler', () => ({
  scheduler: { getHealthSummary: vi.fn().mockReturnValue({ status: 'healthy', jobs: [] }) },
}));
vi.mock('../src/config', () => ({
  config: {
    disableIndexer: false,
    cacheUrl: 'redis://localhost:6379',
    workerStaleIntervalMultiplier: 3,
    workerMaxConsecutiveFailures: 3,
  },
}));

import { getHealthStatus, getLivenessStatus, getReadinessStatus } from '../src/health';

describe('separate liveness, readiness, and dependency health semantics', () => {
  beforeEach(() => {
    queryRead.mockResolvedValue([{ result: 1 }]);
    queryWrite.mockResolvedValue([{ result: 1 }]);
    getRpcTip.mockResolvedValue(1005);
    readiness.current = {
      db: true,
      cache: true,
      rpc: true,
      indexer: true,
      coldStorage: true,
      p2p: true,
      worker: true,
    };
  });

  it('keeps liveness successful when a dependency is unavailable', () => {
    queryRead.mockRejectedValueOnce(new Error('database offline'));

    expect(getLivenessStatus(Date.now()).status).toBe('alive');
    expect(queryRead).not.toHaveBeenCalled();
  });

  it('reports dependency failures without changing liveness semantics', async () => {
    queryRead.mockRejectedValueOnce(new Error('database offline'));

    const health = await getHealthStatus(true);

    expect(health.status).toBe('unhealthy');
    expect(health.dependencies.database.status).toBe('unhealthy');
    expect(getLivenessStatus(Date.now()).status).toBe('alive');
  });

  it('makes readiness fail with named dependency blockers', () => {
    readiness.current.rpc = false;

    const status = getReadinessStatus();

    expect(status.status).toBe('not_ready');
    expect(status.blockers).toContain('rpc');
    expect(getLivenessStatus(Date.now()).status).toBe('alive');
  });
});
