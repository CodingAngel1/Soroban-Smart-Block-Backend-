import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { publicErrorCodeMiddleware } from '../src/middleware/publicErrorCodes';

describe('public machine-readable error codes', () => {
  it('adds a stable code to legacy public JSON error bodies', async () => {
    const app = express();
    app.use(publicErrorCodeMiddleware);
    app.get('/missing', (_req, res) => res.status(404).json({ error: 'Resource missing' }));

    const response = await request(app).get('/missing');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Resource missing', code: 'NOT_FOUND' });
  });

  it('preserves explicit nested codes and exposes the same code at the top level', async () => {
    const app = express();
    app.use(publicErrorCodeMiddleware);
    app.get('/invalid', (_req, res) =>
      res.status(400).json({ success: false, error: { code: 'INVALID_CURSOR', message: 'Bad' } }),
    );

    const response = await request(app).get('/invalid');

    expect(response.body).toEqual({
      success: false,
      error: { code: 'INVALID_CURSOR', message: 'Bad' },
      code: 'INVALID_CURSOR',
    });
  });

  it('returns machine-readable JSON for plain-text error responses', async () => {
    const app = express();
    app.use(publicErrorCodeMiddleware);
    app.get('/unavailable', (_req, res) => res.status(503).send('Service unavailable'));

    const response = await request(app).get('/unavailable');

    expect(response.status).toBe(503);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.body).toEqual({ code: 'SERVICE_UNAVAILABLE', message: 'Service unavailable' });
  });

  it('leaves successful responses unchanged', async () => {
    const app = express();
    app.use(publicErrorCodeMiddleware);
    app.get('/ok', (_req, res) => res.json({ result: 'ok' }));

    const response = await request(app).get('/ok');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ result: 'ok' });
  });
});
