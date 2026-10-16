import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const { getHealthStatusMock } = vi.hoisted(() => ({
  getHealthStatusMock: vi.fn(),
}));

vi.mock('../src/health', () => ({
  getHealthStatus: getHealthStatusMock,
}));
vi.mock('../src/config', () => ({
  config: { stellarNetwork: 'testnet' },
}));

import { createDependencyHealthHandler } from '../src/health-routes';

describe('live dependency health route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createApp(isShuttingDown = false) {
    const app = express();
    const handler = createDependencyHealthHandler(() => isShuttingDown);
    app.get('/health/dependencies', handler);
    app.get('/health/detailed', handler);
    return app;
  }

  it('returns the live dependency result and network for healthy or degraded dependencies', async () => {
    getHealthStatusMock.mockResolvedValue({
      status: 'degraded',
      dependencies: { rpc: { status: 'degraded' } },
    });

    const response = await request(createApp()).get('/health/dependencies');

    expect(getHealthStatusMock).toHaveBeenCalledWith(true);
    expect(response.status).toBe(200);
    expect(response.body.network).toBe('testnet');
    expect(response.body.dependencies.rpc.status).toBe('degraded');
  });

  it('returns 503 for an unhealthy dependency and during shutdown', async () => {
    getHealthStatusMock.mockResolvedValue({
      status: 'unhealthy',
      dependencies: { database: { status: 'unhealthy' } },
    });

    const unhealthy = await request(createApp()).get('/health/detailed');
    expect(unhealthy.status).toBe(503);

    const shuttingDown = await request(createApp(true)).get('/health/dependencies');
    expect(shuttingDown.status).toBe(503);
    expect(shuttingDown.body.status).toBe('shutting_down');
    expect(getHealthStatusMock).toHaveBeenCalledOnce();
  });
});
