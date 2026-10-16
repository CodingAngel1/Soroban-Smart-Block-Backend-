import { describe, expect, it, vi } from 'vitest';
import { OPERATIONS, OPERATION_COUNT, SorobanClient, TransportNotFoundError } from '../src';
import type { FetchLike } from '../src/core/http';

interface RecordedRequest {
  url: string;
  method: string;
}

function makeClient(
  respond: (url: string, method: string) => { status: number; body: unknown },
  requests: RecordedRequest[] = [],
): SorobanClient {
  const fetcher: FetchLike = async (url, init) => {
    requests.push({ url, method: init.method });
    const result = respond(url, init.method);
    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      headers: {
        get: (name) => (name.toLowerCase() === 'x-request-id' ? 'contract-test-1' : null),
      },
      text: async () => JSON.stringify(result.body),
    };
  };

  return new SorobanClient({ baseUrl: 'https://api.example.test/api/v1', fetch: fetcher });
}

describe('generated SDK consumer contract', () => {
  it('exports generated methods and operation metadata from the package entry point', () => {
    expect(OPERATION_COUNT).toBeGreaterThan(0);
    expect(OPERATIONS.getTransactions.path).toBe('/transactions');
    expect(OPERATIONS.getEventsById.path).toBe('/events/{id}');
  });

  it('maps curated transaction/event methods and generic operations to the API contract', async () => {
    const requests: RecordedRequest[] = [];
    const client = makeClient(
      (url) => ({
        status: 200,
        body: { path: new URL(url).pathname, success: true },
      }),
      requests,
    );

    await expect(client.transactions.list({ limit: 2 })).resolves.toMatchObject({ success: true });
    await expect(client.transactions.get('tx/1')).resolves.toMatchObject({ success: true });
    await expect(client.events.list({ limit: 3 })).resolves.toMatchObject({ success: true });
    await expect(client.events.get('event/1')).resolves.toMatchObject({ success: true });
    await expect(
      client.call('getTransactionsByHash', { path: { hash: 'tx/2' } }),
    ).resolves.toMatchObject({ success: true });

    expect(requests.map(({ url, method }) => [new URL(url).pathname, method])).toEqual([
      ['/api/v1/transactions', 'GET'],
      ['/api/v1/transactions/tx%2F1', 'GET'],
      ['/api/v1/events', 'GET'],
      ['/api/v1/events/event%2F1', 'GET'],
      ['/api/v1/transactions/tx%2F2', 'GET'],
    ]);
    expect(new URL(requests[0].url).searchParams.get('limit')).toBe('2');
    expect(new URL(requests[2].url).searchParams.get('limit')).toBe('3');
  });

  it('preserves API failure status, body, request id, and operation id', async () => {
    const fetcher = vi.fn<FetchLike>().mockResolvedValue({
      ok: false,
      status: 404,
      headers: { get: (name) => (name.toLowerCase() === 'x-request-id' ? 'missing-1' : null) },
      text: async () => JSON.stringify({ error: 'Event not found', code: 'NOT_FOUND' }),
    });
    const client = new SorobanClient({
      baseUrl: 'https://api.example.test/api/v1',
      fetch: fetcher,
      maxRetries: 0,
    });

    const error = await client.events.get('missing').catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(TransportNotFoundError);
    expect(error).toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      requestId: 'missing-1',
      operationId: 'getEventsById',
      body: { error: 'Event not found', code: 'NOT_FOUND' },
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
