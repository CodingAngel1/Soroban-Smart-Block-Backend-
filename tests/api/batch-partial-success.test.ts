import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/db', () => ({
  prismaRead: {
    event: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    transaction: {
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
  },
}));

vi.mock('../../src/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { prismaRead } from '../../src/db';
import { batchRouter } from '../../src/api/batch';

const app = express();
app.use(express.json());
app.use(batchRouter);

describe('batch API partial success', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prismaRead.event.findMany).mockResolvedValue([]);
    vi.mocked(prismaRead.transaction.findMany).mockResolvedValue([]);
    vi.mocked(prismaRead.transaction.groupBy).mockResolvedValue([]);
    vi.mocked(prismaRead.event.count).mockResolvedValue(0);
  });

  it('returns found, missing, and invalid event items independently', async () => {
    vi.mocked(prismaRead.event.findMany).mockResolvedValue([
      {
        id: 'found',
        transactionHash: 'tx',
        contractAddress: 'contract',
        eventType: 'transfer',
        topicSymbol: null,
        decoded: null,
        ledgerSequence: 1,
        ledgerCloseTime: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);

    const response = await request(app)
      .post('/events')
      .send({ ids: ['found', 'missing', 42] });

    expect(response.status).toBe(200);
    expect(response.body.data.map((item: { id: string } | null) => item?.id ?? null)).toEqual([
      'found',
      null,
      null,
    ]);
    expect(response.body.missing).toEqual(['missing']);
    expect(response.body.errors).toEqual([
      { index: 2, code: 'INVALID_ITEM', message: 'Item must be a string' },
    ]);
    expect(prismaRead.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['found', 'missing'] } } }),
    );
  });

  it('reports a lookup failure against each affected transaction item', async () => {
    vi.mocked(prismaRead.transaction.findMany).mockRejectedValue(new Error('database unavailable'));

    const response = await request(app)
      .post('/transactions')
      .send({ hashes: ['valid-hash', null] });

    expect(response.status).toBe(503);
    expect(response.body.data).toEqual([null, null]);
    expect(response.body.errors).toEqual([
      { index: 1, code: 'INVALID_ITEM', message: 'Item must be a string' },
      { index: 0, code: 'LOOKUP_FAILED', message: 'Unable to look up item' },
    ]);
  });

  it('reports item-specific account event lookup failures without failing other accounts', async () => {
    vi.mocked(prismaRead.transaction.groupBy).mockResolvedValue([
      {
        sourceAccount: 'active-account',
        _count: { hash: 1 },
        _min: { ledgerSequence: 1, ledgerCloseTime: new Date('2026-01-01T00:00:00.000Z') },
        _max: { ledgerSequence: 1, ledgerCloseTime: new Date('2026-01-01T00:00:00.000Z') },
      },
    ]);
    vi.mocked(prismaRead.event.count).mockRejectedValue(new Error('event store unavailable'));

    const response = await request(app)
      .post('/accounts')
      .send({ addresses: ['active-account', 'inactive-account', false] });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([null, null, null]);
    expect(response.body.inactive).toEqual(['inactive-account']);
    expect(response.body.errors).toEqual([
      { index: 2, code: 'INVALID_ITEM', message: 'Item must be a string' },
      { index: 0, code: 'LOOKUP_FAILED', message: 'Unable to look up item' },
    ]);
  });
});
