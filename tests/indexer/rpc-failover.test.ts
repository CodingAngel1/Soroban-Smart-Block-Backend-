import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registry } from '../../src/metrics';

const { primaryServer, fallbackServer } = vi.hoisted(() => ({
  primaryServer: { getLatestLedger: vi.fn() },
  fallbackServer: { getLatestLedger: vi.fn() },
}));

vi.mock('@stellar/stellar-sdk', () => ({
  SorobanRpc: {
    Server: vi.fn((url: string) => (url.includes('fallback') ? fallbackServer : primaryServer)),
  },
  xdr: {},
}));

vi.mock('../../src/cache', () => ({
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/config', () => ({
  config: {
    profile: {
      name: 'devnet',
      rpcFallbackUrls: ['http://fallback:8000/soroban/rpc'],
    },
    stellarNetwork: 'devnet',
    stellarRpcUrl: 'http://primary:8000/soroban/rpc',
    stellarRpcWsUrl: 'ws://primary:8000/soroban/rpc',
    horizonUrl: 'http://primary:8000',
  },
}));

describe('Stellar RPC endpoint failover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registry.resetMetrics();
  });

  it('fails over on a transient outage, sticks to the healthy endpoint, and rejects client errors', async () => {
    const { getLatestLedger } = await import('../../src/indexer/rpc');

    primaryServer.getLatestLedger.mockRejectedValueOnce(new Error('connection refused'));
    fallbackServer.getLatestLedger.mockResolvedValueOnce({ sequence: '42' });

    await expect(getLatestLedger()).resolves.toBe(42);
    expect(primaryServer.getLatestLedger).toHaveBeenCalledOnce();
    expect(fallbackServer.getLatestLedger).toHaveBeenCalledOnce();

    expect(await registry.getSingleMetricAsString('rpc_endpoint_failovers_total')).toContain(
      'rpc_endpoint_failovers_total{network="devnet",from_endpoint="primary",to_endpoint="fallback_1"} 1',
    );
    expect(await registry.getSingleMetricAsString('rpc_endpoint_active')).toContain(
      'rpc_endpoint_active{network="devnet",endpoint="fallback_1"} 1',
    );

    fallbackServer.getLatestLedger.mockRejectedValueOnce({ status: 400, message: 'Bad request' });
    await expect(getLatestLedger()).rejects.toMatchObject({ status: 400 });
    expect(primaryServer.getLatestLedger).toHaveBeenCalledOnce();

    fallbackServer.getLatestLedger.mockRejectedValueOnce(new Error('fallback unavailable'));
    primaryServer.getLatestLedger.mockRejectedValueOnce(new Error('primary unavailable'));
    await expect(getLatestLedger()).rejects.toThrow('primary unavailable');
    expect(primaryServer.getLatestLedger).toHaveBeenCalledTimes(2);
    expect(fallbackServer.getLatestLedger).toHaveBeenCalledTimes(3);
  });

  it('alerts on sustained RPC errors and endpoint failover', () => {
    const rules = readFileSync('prometheus/stellar-rpc-alerts.yml', 'utf8');

    expect(rules).toContain('StellarRpcSustainedDegradation');
    expect(rules).toContain('StellarRpcEndpointFailover');
    expect(rules).toContain('stellar_rpc:error_ratio:rate5m > 0.1');
  });
});
