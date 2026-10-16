import express, { type Request, type Response } from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config', () => ({
  config: {
    timeoutFastMs: 5000,
    timeoutNormalMs: 30000,
    timeoutLongMs: 300000,
    timeoutExtendedMs: 900000,
  },
}));

import { config } from '../../src/config';
import { requestTimeout, getTimeoutConfig } from '../../src/middleware/requestTimeout';
import { responseSizeBudget } from '../../src/middleware/responseSizeBudget';

vi.mock('../../src/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('expensive endpoint budgets', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('limits serialized response bytes without returning truncated JSON', async () => {
    const app = express();
    app.get('/small', responseSizeBudget(32), (_req, res) => res.json({ value: 'ok' }));
    app.get('/large', responseSizeBudget(32), (_req, res) => res.json({ value: 'x'.repeat(100) }));

    const small = await request(app).get('/small');
    const large = await request(app).get('/large');

    expect(small.status).toBe(200);
    expect(large.status).toBe(500);
    expect(large.body).toEqual({
      error: 'Response exceeded maximum size',
      code: 'RESPONSE_TOO_LARGE',
      maxBytes: 32,
    });
  });

  it('assigns the extended execution budget to compute-heavy routes', () => {
    const timeoutConfig = getTimeoutConfig();

    expect(timeoutConfig['expensive-computation']).toBe(config.timeoutLongMs);
    expect(timeoutConfig['analytics-query']).toBe(config.timeoutLongMs);
    expect(timeoutConfig['archive-query']).toBe(config.timeoutLongMs);
    expect(timeoutConfig['data-export']).toBe(config.timeoutLongMs);
    expect(timeoutConfig['bulk-operation']).toBe(config.timeoutExtendedMs);
  });

  it('returns a timeout response and closes an over-budget request', () => {
    vi.useFakeTimers();
    const socket = { destroy: vi.fn(), destroyed: false };
    const req = {
      path: '/api/v1/verify/run',
      url: '/api/v1/verify/run',
      method: 'POST',
      ip: '127.0.0.1',
      socket,
    } as unknown as Request;
    const response = {
      headersSent: false,
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      on: vi.fn().mockReturnThis(),
    } as unknown as Response;
    const next = vi.fn();

    requestTimeout()(req, response, next);
    vi.advanceTimersByTime(config.timeoutLongMs);

    expect(next).toHaveBeenCalledOnce();
    expect(response.status).toHaveBeenCalledWith(408);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'REQUEST_TIMEOUT' }),
    );
    expect(socket.destroy).toHaveBeenCalledOnce();
  });
});
