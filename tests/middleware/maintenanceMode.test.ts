import express from 'express';
import supertest from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  createMaintenanceModeMiddleware,
  type ApiMaintenanceMode,
} from '../../src/middleware/maintenanceMode';

function makeApp(mode: ApiMaintenanceMode) {
  const app = express();
  app.use(createMaintenanceModeMiddleware(mode, 'testnet'));
  app.get('/api/data', (_req, res) => res.json({ ok: true }));
  app.post('/api/data', (_req, res) => res.status(201).json({ ok: true }));
  app.get('/healthz', (_req, res) => res.json({ status: 'alive' }));
  app.get('/metrics', (_req, res) => res.type('text/plain').send('up 1'));
  return app;
}

describe('API maintenance mode middleware', () => {
  it('keeps all APIs available when disabled', async () => {
    const app = makeApp('off');
    await supertest(app).get('/api/data').expect(200, { ok: true });
    await supertest(app).post('/api/data').expect(201, { ok: true });
  });

  it('rejects read methods but leaves writes available in reads mode', async () => {
    const app = makeApp('reads');
    const response = await supertest(app).get('/api/data').expect(503);

    expect(response.body).toMatchObject({
      code: 'MAINTENANCE_MODE',
      maintenance: true,
      mode: 'reads',
      network: 'testnet',
    });
    await supertest(app).post('/api/data').expect(201, { ok: true });
  });

  it('rejects writes but leaves reads available in writes mode', async () => {
    const app = makeApp('writes');
    await supertest(app).get('/api/data').expect(200, { ok: true });
    await supertest(app).post('/api/data').expect(503);
  });

  it('rejects both method classes in all mode but exempts probes and metrics', async () => {
    const app = makeApp('all');
    await supertest(app).get('/api/data').expect(503);
    await supertest(app).post('/api/data').expect(503);
    await supertest(app).get('/healthz').expect(200, { status: 'alive' });
    await supertest(app).get('/metrics').expect(200, 'up 1');
  });
});
