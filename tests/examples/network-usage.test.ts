import { describe, expect, it, vi } from 'vitest';
import { createNetworkClient, fetchRecentActivity } from '../../examples/networks/client';

describe('network-specific SDK examples', () => {
  it.each([
    ['mainnet', 'SOROBAN_MAINNET_API_URL', 'https://mainnet.example.test/api/v1'],
    ['testnet', 'SOROBAN_TESTNET_API_URL', 'https://testnet.example.test/api/v1'],
  ] as const)('uses the configured %s API for both core endpoints', async (network, key, url) => {
    const requests: string[] = [];
    const fetcher = vi.fn(async (input: string) => {
      requests.push(input);
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => JSON.stringify({ data: [], total: 0, page: 1, limit: 5 }),
      };
    });
    const client = createNetworkClient(
      network,
      { [key]: url, SOROBAN_API_KEY: 'example-key' },
      fetcher,
    );

    const result = await fetchRecentActivity(client);

    expect(result.transactions).toMatchObject({ data: [] });
    expect(result.events).toMatchObject({ data: [] });
    expect(requests).toEqual([`${url}/transactions?limit=5`, `${url}/events?limit=5`]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each(['mainnet', 'testnet'] as const)(
    'requires an explicit %s URL instead of silently falling back to another network',
    (network) => {
      expect(() => createNetworkClient(network, {})).toThrow(
        `SOROBAN_${network.toUpperCase()}_API_URL must be set`,
      );
    },
  );
});
