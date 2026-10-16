import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const mocks = vi.hoisted(() => ({
  collectionFindMany: vi.fn(),
  collectionCount: vi.fn(),
  collectionAggregate: vi.fn(),
}));

vi.mock('../../src/db', () => ({
  prismaRead: {
    nftCollection: {
      findMany: mocks.collectionFindMany,
      count: mocks.collectionCount,
      aggregate: mocks.collectionAggregate,
    },
  },
  prismaWrite: {},
}));

vi.mock('../../src/middleware/errorHandler', () => {
  class MockAppError extends Error {
    constructor(
      public statusCode: number,
      message: string,
      public code: string,
    ) {
      super(message);
    }
  }

  return {
    AppError: MockAppError,
    errorHandler: (
      error: MockAppError,
      _req: import('express').Request,
      res: import('express').Response,
      _next: import('express').NextFunction,
    ) =>
      res.status(error.statusCode).json({
        success: false,
        error: { code: error.code, message: error.message },
      }),
  };
});

import { nftRouter } from '../../src/api/nft';
import { errorHandler } from '../../src/middleware/errorHandler';
import { createCursorScope, decodeOpaqueCursor } from '../../src/utils/opaque-cursor';

const app = express();
app.use('/nft', nftRouter);
app.use(errorHandler);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('NFT query-bound cursors', () => {
  it('encrypts the collection cursor and resumes from its internal ID', async () => {
    mocks.collectionFindMany.mockResolvedValueOnce([
      { id: 'collection-1', name: 'One', symbol: 'ONE' },
      { id: 'collection-2', name: 'Two', symbol: 'TWO' },
    ]);
    mocks.collectionCount.mockResolvedValue(2);
    mocks.collectionAggregate.mockResolvedValue({ _sum: { volume24h: 0 } });

    const firstPage = await request(app).get('/nft/collections?limit=1');
    expect(firstPage.status).toBe(200);
    const scope = createCursorScope('nft/collections', { limit: '1' });
    expect(firstPage.body.pagination.cursor).not.toContain('collection-1');
    expect(decodeOpaqueCursor(firstPage.body.pagination.cursor, scope)).toBe('collection-1');

    mocks.collectionFindMany.mockResolvedValueOnce([]);
    const nextPage = await request(app)
      .get('/nft/collections')
      .query({ cursor: firstPage.body.pagination.cursor, limit: 1 });
    expect(nextPage.status).toBe(200);
    expect(mocks.collectionFindMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { isSpam: false, id: { gt: 'collection-1' } } }),
    );
  });

  it('rejects a collection cursor when the sort query changes', async () => {
    mocks.collectionFindMany.mockResolvedValueOnce([
      { id: 'collection-1', name: 'One', symbol: 'ONE' },
      { id: 'collection-2', name: 'Two', symbol: 'TWO' },
    ]);
    mocks.collectionCount.mockResolvedValue(2);
    mocks.collectionAggregate.mockResolvedValue({ _sum: { volume24h: 0 } });

    const firstPage = await request(app).get('/nft/collections?limit=1');
    const response = await request(app)
      .get('/nft/collections')
      .query({ cursor: firstPage.body.pagination.cursor, limit: 1, sort: 'floorPrice' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_CURSOR');
  });
});
