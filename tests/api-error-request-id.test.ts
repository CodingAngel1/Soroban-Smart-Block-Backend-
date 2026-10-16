import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../src/config', () => ({ config: { nodeEnv: 'test' } }));
vi.mock('../src/metrics', () => ({ httpErrorsTotal: { inc: vi.fn() } }));

import { errorHandler, NotFoundError } from '../src/middleware/errorHandler';
import { requestContext } from '../src/middleware/requestContext';

describe('API error request IDs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('echoes an incoming request ID in API error headers and body', async () => {
    const app = express();
    app.use(requestContext);

    app.get('/api/not-found', (_req, _res, next) => {
      next(new NotFoundError('Transaction not found'));
    });

    app.use(errorHandler);

    const requestId = 'support-ticket-123';
    const response = await request(app).get('/api/not-found').set('X-Request-Id', requestId);

    expect(response.status).toBe(404);
    expect(response.headers['x-request-id']).toBe(requestId);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Transaction not found' },
      meta: { requestId },
    });
  });

  it('generates one request ID for an error when the client sends none', async () => {
    const app = express();
    app.use(requestContext);
    app.get('/api/not-found', (_req, _res, next) => next(new NotFoundError('Not found')));
    app.use(errorHandler);

    const response = await request(app).get('/api/not-found');
    expect(response.status).toBe(404);
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.body.meta.requestId).toBe(response.headers['x-request-id']);
  });
});
