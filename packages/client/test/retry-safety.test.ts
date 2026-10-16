import { describe, expect, it, vi } from 'vitest';
import { NetworkError, SorobanClient, TransportServerError } from '../src';
import type { FetchLike } from '../src/core/http';

function jsonResponse(status: number, body: unknown, retryAfter?: string) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => {
        if (name.toLowerCase() === 'retry-after') return retryAfter ?? null;
        return null;
      },
    },
    text: async () => JSON.stringify(body),
  };
}

describe('safe retry behavior', () => {
  it('retries an idempotent GET after a transient 503', async () => {
    let attempts = 0;
    const fetcher: FetchLike = async () => {
      attempts += 1;
      return attempts === 1
        ? jsonResponse(503, { error: 'temporarily unavailable' })
        : jsonResponse(200, { data: [] });
    };
    const client = new SorobanClient({
      baseUrl: 'https://api.example.test/api/v1',
      fetch: fetcher,
      maxRetries: 1,
      maxRetryDelayMs: 0,
    });

    await expect(client.transactions.list()).resolves.toEqual({ data: [] });
    expect(attempts).toBe(2);
  });

  it('does not replay a POST after a server error', async () => {
    const fetcher = vi.fn<FetchLike>().mockResolvedValue(jsonResponse(503, { error: 'down' }));
    const client = new SorobanClient({
      baseUrl: 'https://api.example.test/api/v1',
      fetch: fetcher,
      maxRetries: 3,
      maxRetryDelayMs: 0,
    });

    await expect(
      client.call('postWebhooks', { body: { url: 'https://example.test/hook' } }),
    ).rejects.toBeInstanceOf(TransportServerError);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('does not replay a POST after a network failure with an unknown outcome', async () => {
    const fetcher = vi.fn<FetchLike>().mockRejectedValue(new Error('connection reset'));
    const client = new SorobanClient({
      baseUrl: 'https://api.example.test/api/v1',
      fetch: fetcher,
      maxRetries: 3,
      maxRetryDelayMs: 0,
    });

    await expect(
      client.call('postWebhooks', { body: { url: 'https://example.test/hook' } }),
    ).rejects.toBeInstanceOf(NetworkError);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('retries a POST only after a rate-limit rejection', async () => {
    let attempts = 0;
    const fetcher: FetchLike = async () => {
      attempts += 1;
      return attempts === 1
        ? jsonResponse(429, { error: 'rate limited' }, '0')
        : jsonResponse(201, { id: 'hook-1' });
    };
    const client = new SorobanClient({
      baseUrl: 'https://api.example.test/api/v1',
      fetch: fetcher,
      maxRetries: 1,
      maxRetryDelayMs: 0,
    });

    await expect(
      client.call('postWebhooks', { body: { url: 'https://example.test/hook' } }),
    ).resolves.toEqual({ id: 'hook-1' });
    expect(attempts).toBe(2);
  });
});
