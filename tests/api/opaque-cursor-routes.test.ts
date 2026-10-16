import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const mocks = vi.hoisted(() => ({
  listTransactions: vi.fn(),
  listEvents: vi.fn(),
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

vi.mock('../../src/services/transaction.service', () => ({
  transactionService: { listTransactions: mocks.listTransactions },
}));

vi.mock('../../src/services/event.service', () => ({
  eventService: { listEvents: mocks.listEvents },
}));

import { eventRouter } from '../../src/api/events';
import { transactionRouter } from '../../src/api/transactions';
import { errorHandler } from '../../src/middleware/errorHandler';
import {
  createCursorScope,
  decodeOpaqueCursor,
  encodeOpaqueCursor,
} from '../../src/utils/opaque-cursor';

const app = express();
app.use('/transactions', transactionRouter);
app.use('/events', eventRouter);
app.use(errorHandler);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('query-bound API cursors', () => {
  it('issues an opaque transaction cursor and decodes it for the same query', async () => {
    const position = { ledgerSequence: 100, id: 'tx-row-id' };
    mocks.listTransactions
      .mockResolvedValueOnce({ data: [], nextCursor: position, hasNext: true })
      .mockResolvedValueOnce({ data: [], nextCursor: null, hasNext: false });

    const scope = createCursorScope('transactions', { limit: 1, status: 'success' });
    const firstPage = await request(app).get('/transactions?limit=1&status=success');
    expect(firstPage.status).toBe(200);
    expect(firstPage.body.nextCursor).not.toContain(position.id);
    expect(decodeOpaqueCursor(firstPage.body.nextCursor, scope)).toEqual(position);

    const nextPage = await request(app)
      .get('/transactions')
      .query({ cursor: firstPage.body.nextCursor, limit: 1, status: 'success' });
    expect(nextPage.status).toBe(200);
    expect(mocks.listTransactions).toHaveBeenLastCalledWith({
      cursor: position,
      page: 1,
      limit: 1,
      status: 'success',
    });
  });

  it('rejects a transaction cursor when its query changes', async () => {
    const scope = createCursorScope('transactions', { limit: 1, status: 'success' });
    const cursor = encodeOpaqueCursor({ ledgerSequence: 100, id: 'tx-row-id' }, scope);

    const response = await request(app)
      .get('/transactions')
      .query({ cursor, limit: 1, status: 'failed' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_CURSOR');
    expect(mocks.listTransactions).not.toHaveBeenCalled();
  });

  it('issues and validates event cursors against their original filters', async () => {
    const scope = createCursorScope('events', { limit: 1, type: 'transfer' });
    mocks.listEvents.mockResolvedValueOnce({
      data: [],
      total: 0,
      page: 1,
      limit: 1,
      nextCursor: 'event-row-id',
    });

    const firstPage = await request(app).get('/events?limit=1&type=transfer');
    expect(firstPage.status).toBe(200);
    expect(decodeOpaqueCursor(firstPage.body.nextCursor, scope)).toBe('event-row-id');

    const wrongQuery = await request(app)
      .get('/events')
      .query({ cursor: firstPage.body.nextCursor, limit: 1, type: 'mint' });
    expect(wrongQuery.status).toBe(400);
    expect(wrongQuery.body.error.code).toBe('INVALID_CURSOR');
  });
});
