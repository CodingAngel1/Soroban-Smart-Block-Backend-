import { describe, expect, it } from 'vitest';
import { checkTokenBucket, TIER_LIMITS } from '../src/middleware/tokenBucket';

describe('Redis token-bucket tier policies', () => {
  it.each([
    ['free', 1000, 50],
    ['developer', 1000, 50],
    ['pro', 10_000, 200],
    ['enterprise', 60_000, 500],
  ] as const)('%s tier publishes its configured limit and burst', (tier, perMinute, burst) => {
    expect(TIER_LIMITS[tier]).toMatchObject({ perMinute, burst });
  });

  it.each([
    ['free', 1000],
    ['developer', 1000],
    ['pro', 10_000],
    ['enterprise', 60_000],
  ] as const)(
    'returns the %s effective request limit in rate-limit metadata',
    async (tier, limit) => {
      const result = await checkTokenBucket(
        `policy-test-${tier}-${Math.random()}`,
        tier,
        'GET',
        '/api/v1/transactions',
      );

      expect(result).toMatchObject({ tier, limit });
    },
  );

  it('scales the reported limit for expensive endpoint groups', async () => {
    const result = await checkTokenBucket(
      `policy-test-simulate-${Math.random()}`,
      'pro',
      'POST',
      '/api/v1/simulate',
    );

    expect(result.limit).toBe(800);
  });
});
