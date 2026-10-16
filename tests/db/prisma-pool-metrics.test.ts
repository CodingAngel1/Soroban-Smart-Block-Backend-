import { beforeEach, describe, expect, it, vi } from 'vitest';
import { combinePrometheusExpositions } from '../../src/db/prisma-pool-metrics';

const { mockPrometheus } = vi.hoisted(() => ({ mockPrometheus: vi.fn() }));
vi.mock('../../src/db', () => ({
  prismaWrite: { $metrics: { prometheus: mockPrometheus } },
  prismaRead: { $metrics: { prometheus: mockPrometheus } },
  prismaBackfill: { $metrics: { prometheus: mockPrometheus } },
}));

describe('Prisma pool metrics exposition', () => {
  beforeEach(() => {
    mockPrometheus.mockReset();
  });

  it('combines client samples without duplicate HELP or TYPE declarations', () => {
    const result = combinePrometheusExpositions([
      '# HELP prisma_pool_connections_open Open connections\n# TYPE prisma_pool_connections_open gauge\nprisma_pool_connections_open{pool="write"} 3',
      '# HELP prisma_pool_connections_open Open connections\n# TYPE prisma_pool_connections_open gauge\nprisma_pool_connections_open{pool="read"} 2',
    ]);

    expect(result.match(/# HELP prisma_pool_connections_open/g)).toHaveLength(1);
    expect(result.match(/# TYPE prisma_pool_connections_open/g)).toHaveLength(1);
    expect(result).toContain('prisma_pool_connections_open{pool="write"} 3');
    expect(result).toContain('prisma_pool_connections_open{pool="read"} 2');
  });

  it('keeps metric collection failures visible to the caller', async () => {
    const { getPrismaPoolMetrics } = await import('../../src/db/prisma-pool-metrics');
    mockPrometheus.mockRejectedValueOnce(new Error('metrics engine unavailable'));
    await expect(getPrismaPoolMetrics()).rejects.toThrow('metrics engine unavailable');
  });

  it('labels metrics from each Prisma connection pool', async () => {
    const { getPrismaPoolMetrics } = await import('../../src/db/prisma-pool-metrics');
    mockPrometheus
      .mockResolvedValueOnce('prisma_pool_connections_open{pool="write"} 3')
      .mockResolvedValueOnce('prisma_pool_connections_open{pool="read"} 2')
      .mockResolvedValueOnce('prisma_pool_connections_open{pool="backfill"} 1');

    const metrics = await getPrismaPoolMetrics();

    expect(mockPrometheus).toHaveBeenNthCalledWith(1, { globalLabels: { pool: 'write' } });
    expect(mockPrometheus).toHaveBeenNthCalledWith(2, { globalLabels: { pool: 'read' } });
    expect(mockPrometheus).toHaveBeenNthCalledWith(3, { globalLabels: { pool: 'backfill' } });
    expect(metrics).toContain('pool="write"');
    expect(metrics).toContain('pool="read"');
    expect(metrics).toContain('pool="backfill"');
  });
});
