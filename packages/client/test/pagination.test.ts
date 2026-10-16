import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { SorobanClient } from '../src';
import type { OperationId, OperationParams } from '../src';

type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void;
let handler: Handler = (_req, res) => res.end('{}');
let server: http.Server;
let baseUrl = '';

beforeAll(async () => {
  server = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => handler(req, res));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

function json(res: http.ServerResponse, body: unknown) {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function collect<K extends OperationId>(
  client: SorobanClient,
  operationId: K,
  params?: OperationParams[K],
  options?: { maxPages?: number },
) {
  const items: unknown[] = [];
  for await (const item of client.paginate(operationId, params, options)) items.push(item);
  return items;
}

describe('SorobanClient pagination', () => {
  it('iterates offset pages using page, pages, and total metadata', async () => {
    const seenPages: number[] = [];
    handler = (req, res) => {
      const page = Number(new URL(req.url ?? '', 'http://x').searchParams.get('page'));
      seenPages.push(page);
      json(res, { data: [page], page, pages: 3, total: 3 });
    };
    const client = new SorobanClient({ baseUrl });

    await expect(collect(client, 'getTransactions', { query: { limit: 1 } })).resolves.toEqual([
      1, 2, 3,
    ]);
    expect(seenPages).toEqual([1, 2, 3]);
  });

  it('supports nested cursor metadata and starts at the requested page', async () => {
    const seen: Array<{ page: string | null; cursor: string | null }> = [];
    handler = (req, res) => {
      const query = new URL(req.url ?? '', 'http://x').searchParams;
      seen.push({ page: query.get('page'), cursor: query.get('cursor') });
      if (query.get('page') === '3') {
        return json(res, { data: ['first'], pagination: { hasMore: true, cursor: 10 } });
      }
      json(res, { data: ['last'], pagination: { hasMore: false, cursor: null } });
    };
    const client = new SorobanClient({ baseUrl });

    await expect(
      collect(client, 'getTransactions', { query: { page: 3, limit: 1 } }),
    ).resolves.toEqual(['first', 'last']);
    expect(seen).toEqual([
      { page: '3', cursor: null },
      { page: null, cursor: '10' },
    ]);
  });

  it('rejects malformed responses and continuation without a cursor or page parameter', async () => {
    const client = new SorobanClient({ baseUrl });
    handler = (_req, res) => json(res, { items: ['not a page'] });
    await expect(collect(client, 'getTransactions')).rejects.toThrow(
      /expected an array or an object with a data array/,
    );

    handler = (_req, res) => json(res, { data: ['one'], hasNext: true });
    await expect(collect(client, 'getTransactionsByHash', { path: { hash: 'h' } })).rejects.toThrow(
      /provides no cursor or page parameter/,
    );
  });

  it('rejects repeated cursors, invalid maxPages, and pagination beyond the page cap', async () => {
    const client = new SorobanClient({ baseUrl });
    await expect(collect(client, 'getTransactions', undefined, { maxPages: 0 })).rejects.toThrow(
      /maxPages must be a positive safe integer/,
    );

    handler = (_req, res) => json(res, { data: ['one'], hasNext: true, nextCursor: 10 });
    await expect(collect(client, 'getTransactions')).rejects.toThrow(/repeated cursor 10/);

    let requests = 0;
    handler = (_req, res) => {
      requests += 1;
      json(res, { data: [requests], page: requests, pages: 2 });
    };
    await expect(collect(client, 'getTransactions', undefined, { maxPages: 1 })).rejects.toThrow(
      /exceeded maxPages \(1\)/,
    );
    expect(requests).toBe(1);
  });
});
