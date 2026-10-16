import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const control = vi.hoisted(() => ({
  state: { network: 'testnet', paused: false },
}));

vi.mock('../../src/config', () => ({
  config: { adminApiKey: 'operator-test-token' },
}));

vi.mock('../../src/indexer/worker-control', () => ({
  getIndexerPauseState: vi.fn(async () => ({ ...control.state })),
  setIndexerPaused: vi.fn(async (paused: boolean) => {
    control.state.paused = paused;
    return { ...control.state };
  }),
}));

vi.mock('../../src/services/admin.service', () => ({
  adminService: { runConsistencyCheck: vi.fn() },
}));

import { adminRouter } from '../../src/api/admin';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/admin', adminRouter);
  return app;
}

describe('indexer worker operator controls', () => {
  beforeEach(() => {
    control.state = { network: 'testnet', paused: false };
  });

  it('requires admin authentication before changing worker state', async () => {
    const response = await request(createApp()).post('/admin/indexer/pause');

    expect(response.status).toBe(401);
    expect(control.state.paused).toBe(false);
  });

  it('pauses and resumes the worker and reports persistent network state', async () => {
    const app = createApp();
    const headers = { 'x-admin-token': 'operator-test-token' };

    const paused = await request(app).post('/admin/indexer/pause').set(headers);
    expect(paused.status).toBe(200);
    expect(paused.body).toEqual({ network: 'testnet', paused: true });

    const status = await request(app).get('/admin/indexer/control').set(headers);
    expect(status.status).toBe(200);
    expect(status.body).toEqual({ network: 'testnet', paused: true });

    const resumed = await request(app).post('/admin/indexer/resume').set(headers);
    expect(resumed.status).toBe(200);
    expect(resumed.body).toEqual({ network: 'testnet', paused: false });
  });
});
