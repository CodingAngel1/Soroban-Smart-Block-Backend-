import { afterEach, describe, expect, it, vi } from 'vitest';

describe('Redis cache metrics', () => {
  afterEach(() => {
    vi.unmock('redis');
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('counts Redis hits, misses, writes, and failures by bounded family', async () => {
    vi.resetModules();
    vi.stubEnv('STELLAR_NETWORK', 'testnet');
    vi.stubEnv('CACHE_URL', 'redis://localhost:6379');
    vi.stubEnv('TESTNET_CACHE_URL', 'redis://localhost:6379');

    const client = {
      on: vi.fn(),
      connect: vi.fn().mockResolvedValue(undefined),
      get: vi
        .fn()
        .mockResolvedValueOnce(JSON.stringify({ value: 1 }))
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new Error('read failed'))
        .mockResolvedValue(null),
      pTTL: vi.fn().mockResolvedValue(1_000),
      multi: () => ({ set: vi.fn().mockReturnThis(), exec: vi.fn().mockResolvedValue([]) }),
      del: vi.fn().mockResolvedValue(1),
      publish: vi.fn().mockResolvedValue(1),
      quit: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
    };
    vi.doMock('redis', () => ({ createClient: () => client }));

    const cache = await import('../src/cache');
    const { redisCacheOperationsTotal } = await import('../src/metrics');

    expect(await cache.cacheGet('abi:found')).toEqual({ value: 1 });
    expect(await cache.cacheGet('abi:missing')).toBeNull();
    await cache.cacheSet('abi:write', { value: 2 });
    await expect(cache.cacheGet('audit-verify:broken')).resolves.toBeNull();

    const { values } = await redisCacheOperationsTotal.get();
    expect(values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          labels: { family: 'abi', operation: 'get', outcome: 'hit' },
          value: 1,
        }),
        expect.objectContaining({
          labels: { family: 'abi', operation: 'get', outcome: 'miss' },
          value: 1,
        }),
        expect.objectContaining({
          labels: { family: 'abi', operation: 'set', outcome: 'success' },
          value: 1,
        }),
        expect.objectContaining({
          labels: { family: 'audit-verify', operation: 'get', outcome: 'error' },
          value: 1,
        }),
      ]),
    );

    await cache.cacheClose();
  });

  it('does not count L1 hits as Redis operations', async () => {
    vi.resetModules();
    vi.stubEnv('STELLAR_NETWORK', 'testnet');
    vi.stubEnv('CACHE_URL', 'redis://localhost:6379');
    vi.stubEnv('TESTNET_CACHE_URL', 'redis://localhost:6379');

    const client = {
      on: vi.fn(),
      connect: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(JSON.stringify('value')),
      pTTL: vi.fn().mockResolvedValue(1_000),
      quit: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
    };
    vi.doMock('redis', () => ({ createClient: () => client }));

    const cache = await import('../src/cache');
    const { redisCacheOperationsTotal } = await import('../src/metrics');
    await cache.cacheGet('ledger:1');
    await cache.cacheGet('ledger:1');

    expect(client.get).toHaveBeenCalledTimes(2);
    const { values } = await redisCacheOperationsTotal.get();
    expect(values).toEqual([
      expect.objectContaining({
        labels: { family: 'ledger', operation: 'get', outcome: 'hit' },
        value: 1,
      }),
    ]);
    await cache.cacheClose();
  });
});
