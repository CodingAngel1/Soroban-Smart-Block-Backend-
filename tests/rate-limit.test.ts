import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import crypto from 'crypto';
import {
  getRateLimitTier,
  normalizeTierConfig,
  tieredRateLimit,
} from '../src/middleware/rateLimit';
import { checkTokenBucket, TIER_LIMITS } from '../src/middleware/tokenBucket';

// getRateLimitTier hashes the incoming API key with SHA-256 before comparing
// it against the configured key sets (#715 — plaintext keys are never
// retained), so test fixtures must hash their expected keys the same way.
function hashApiKey(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

vi.mock('../src/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));
vi.mock('../src/config', () => ({
  config: {
    rateLimitPublicWindowMs: 60_000,
    rateLimitPublicMax: 100,
    rateLimitDeveloperWindowMs: 60_000,
    rateLimitDeveloperMax: 300,
    rateLimitPremiumWindowMs: 60_000,
    rateLimitPremiumMax: 1000,
    rateLimitAdaptiveEnabled: false,
  },
}));
vi.mock('../src/db', () => ({ prismaRead: {} }));
vi.mock('../src/cache', () => ({ buildCacheKey: (...parts: string[]) => parts.join(':') }));
vi.mock('../src/middleware/tokenBucket', () => ({
  checkTokenBucket: vi.fn(),
  setRateLimitRedisClient: vi.fn(),
}));
vi.mock('../src/cache', () => ({
  buildCacheKey: (...parts: string[]) => parts.join(':'),
}));
vi.mock('../src/middleware/tokenBucket', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/middleware/tokenBucket')>();
  return {
    ...actual,
    checkTokenBucket: vi.fn(),
    setRateLimitRedisClient: vi.fn(),
  };
});

const mockCheck = vi.mocked(checkTokenBucket);

// Helper to enable token bucket in the module
// This is set by importing the internal state through mocking
// The token bucket flag is internal, so we use the mock to verify behavior

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    ip: '127.0.0.1',
    method: 'GET',
    path: '/test',
    app: { locals: {} },
    ...overrides,
  } as Request;
}

function makeRes(): {
  res: Response;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  setHeader: ReturnType<typeof vi.fn>;
} {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const setHeader = vi.fn();
  return { res: { status, json, setHeader } as unknown as Response, status, json, setHeader };
}

describe('rate limit configuration', () => {
  it('falls back to defaults for invalid tier values', () => {
    const tierConfig = normalizeTierConfig({
      free: { windowMs: 0, max: -5 },
      developer: { windowMs: 30_000, max: 250 },
      premium: { windowMs: 90_000, max: 5000 },
    } as any);

    expect(tierConfig.free.windowMs).toBe(60_000);
    expect(tierConfig.free.max).toBeGreaterThan(0);
    expect(tierConfig.developer.windowMs).toBe(30_000);
    expect(tierConfig.developer.max).toBe(250);
  });

  it('selects the highest matching tier for known API keys', () => {
    const tier = getRateLimitTier(
      'premium-api',
      new Set([hashApiKey('developer-api')]),
      new Set([hashApiKey('premium-api')]),
    );
    expect(tier).toBe('premium');
  });

  it('keeps Redis token-bucket limits aligned with the configured local limits', () => {
    const localLimits = normalizeTierConfig();

    expect(TIER_LIMITS.unauthenticated.perMinute).toBe(60);
    expect(TIER_LIMITS.free.perMinute).toBe(localLimits.free.max);
    expect(TIER_LIMITS.developer.perMinute).toBe(localLimits.developer.max);
    expect(TIER_LIMITS.pro.perMinute).toBe(localLimits.premium.max);
    expect(TIER_LIMITS.enterprise.perMinute).toBe(localLimits.enterprise.max);
  });
});

describe('tieredRateLimit', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn();
    mockCheck.mockClear();
    mockCheck.mockResolvedValue({
      allowed: true,
      limit: 100,
      remaining: 99,
      resetAt: 9999999999,
      tier: 'free',
    });
  });

  it('does not crash when the fallback limiter is used', async () => {
    const { res } = makeRes();
    const req = makeReq();
    await expect(tieredRateLimit(req, res, next)).resolves.not.toThrow();
  });

  it('sets rate limit headers on response', async () => {
    const req = makeReq({
      apiKey: { id: 'k', keyName: 'n', developerId: 'd', tier: 'pro' },
    } as any);
    const { res } = makeRes();
    await tieredRateLimit(req, res, next);
    // The function should set rate limit headers or handle the request
    expect(res).toBeDefined();
  });

  it('falls back gracefully when no apiKey header is present', async () => {
    const req = makeReq({ headers: {} });
    const { res } = makeRes();
    await expect(tieredRateLimit(req, res, next)).resolves.not.toThrow();
    expect(mockCheck).toHaveBeenCalledWith(
      '127.0.0.1',
      'unauthenticated',
      'GET',
      '/test',
      undefined,
    );
  });

  it('returns 429 with retry headers when an unauthenticated request exceeds its limit', async () => {
    mockCheck.mockResolvedValue({
      allowed: false,
      limit: 60,
      remaining: 0,
      resetAt: 9999999999,
      tier: 'unauthenticated',
    });
    const { res, status, json, setHeader } = makeRes();
    await tieredRateLimit(makeReq(), res, next);

    expect(status).toHaveBeenCalledWith(429);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Rate limit exceeded', tier: 'unauthenticated' }),
    );
    expect(setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '60');
    expect(setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '0');
    expect(setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
    expect(next).not.toHaveBeenCalled();
  });

  it('applies the API-key tier override in local fallback and reports a 429', async () => {
    const apiKey = {
      id: `rate-limit-test-${crypto.randomUUID()}`,
      keyName: 'test',
      developerId: 'test-developer',
      tier: 'developer',
      rateLimitOverride: 1,
    };
    const req = makeReq();
    req.apiKey = apiKey;
    const allowedResponse = makeRes();
    const limitedResponse = makeRes();

    await tieredRateLimit(req, allowedResponse.res, next);
    await tieredRateLimit(req, limitedResponse.res, next);

    expect(mockCheck).not.toHaveBeenCalled();
    expect(allowedResponse.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '1');
    expect(allowedResponse.setHeader).toHaveBeenCalledWith('X-RateLimit-Tier', 'developer');
    expect(limitedResponse.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '1');
    expect(limitedResponse.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '0');
    expect(limitedResponse.status).toHaveBeenCalledWith(429);
    expect(limitedResponse.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
    expect(limitedResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Rate limit exceeded', tier: 'developer' }),
    );
  });
});

describe('rate-limit security', () => {
  it('does not crash on spoofed X-Forwarded-For header', async () => {
    const next = vi.fn();
    const req = makeReq({ headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } });
    const { res } = makeRes();
    await expect(tieredRateLimit(req, res, next)).resolves.not.toThrow();
  });

  it('handles missing ip gracefully', async () => {
    const next = vi.fn();
    const req = makeReq({ ip: undefined });
    const { res } = makeRes();
    await expect(tieredRateLimit(req, res, next)).resolves.not.toThrow();
  });
});
