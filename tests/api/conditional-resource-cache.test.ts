import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/transaction.service', () => ({
  transactionService: {
    getTransactionByHash: vi.fn(),
  },
}));

import { transactionService } from '../../src/services/transaction.service';
import { transactionRouter } from '../../src/api/transactions';

const app = express();
app.use('/transactions', transactionRouter);

describe('conditional caching for stable resource endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(transactionService.getTransactionByHash).mockResolvedValue({
      hash: 'stable-hash',
      status: 'success',
    });
  });

  it('returns an ETag and cache policy for a transaction resource', async () => {
    const response = await request(app).get('/transactions/stable-hash');

    expect(response.status).toBe(200);
    expect(response.headers.etag).toBeTruthy();
    expect(response.headers['cache-control']).toBe('public, max-age=0, must-revalidate');
    expect(response.headers.vary).toContain('X-Network');
  });

  it('returns 304 without a body for a matching If-None-Match validator', async () => {
    const first = await request(app).get('/transactions/stable-hash');
    const second = await request(app)
      .get('/transactions/stable-hash')
      .set('If-None-Match', first.headers.etag);

    expect(second.status).toBe(304);
    expect(second.text).toBe('');
    expect(second.headers.etag).toBe(first.headers.etag);
  });

  it('returns the representation for a stale validator', async () => {
    const response = await request(app)
      .get('/transactions/stable-hash')
      .set('If-None-Match', '"stale"');

    expect(response.status).toBe(200);
    expect(response.body.hash).toBe('stable-hash');
  });
});
