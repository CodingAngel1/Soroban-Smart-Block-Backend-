import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const { findUnique } = vi.hoisted(() => ({
  findUnique: vi.fn(),
}));

vi.mock('../../src/db', () => ({
  prismaRead: { transaction: { findUnique } },
  prismaWrite: {},
}));

vi.mock('../../src/indexer/bn254-tracker', () => ({
  getBn254ExemptionByTx: vi.fn().mockResolvedValue(null),
}));

import { transactionRouter } from '../../src/api/transactions';

const app = express().use('/api/v1/transactions', transactionRouter);

describe('GET /api/v1/transactions/:hash/xdr', () => {
  beforeEach(() => findUnique.mockReset());

  it('returns the retained transaction envelope as base64', async () => {
    findUnique.mockResolvedValue({ hash: 'abc123hash', rawXdr: 'AAAAAQAAAA==' });

    const response = await request(app).get('/api/v1/transactions/abc123hash/xdr');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      transactionHash: 'abc123hash',
      encoding: 'base64',
      xdr: 'AAAAAQAAAA==',
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: { hash: 'abc123hash' },
      select: { hash: true, rawXdr: true },
    });
  });

  it('returns 404 when the transaction does not exist', async () => {
    findUnique.mockResolvedValue(null);

    const response = await request(app).get('/api/v1/transactions/unknownhash/xdr');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Transaction not found' });
  });

  it('returns 404 when upstream data did not include raw XDR', async () => {
    findUnique.mockResolvedValue({ hash: 'abc123hash', rawXdr: '' });

    const response = await request(app).get('/api/v1/transactions/abc123hash/xdr');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Raw transaction XDR is not available' });
  });
});
