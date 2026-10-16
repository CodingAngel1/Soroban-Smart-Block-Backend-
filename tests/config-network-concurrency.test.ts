import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

async function loadConfig() {
  vi.resetModules();
  const { config } = await import('../src/config');
  return config;
}

describe('network-specific indexer catch-up concurrency', () => {
  beforeEach(() => {
    vi.stubEnv('STELLAR_NETWORK', 'testnet');
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost/test');
    vi.stubEnv('TESTNET_DATABASE_URL', 'postgresql://localhost/test');
    vi.stubEnv('TESTNET_READ_REPLICA_URL', 'postgresql://localhost/test');
    vi.stubEnv('INDEXER_CATCHUP_WORKERS', '8');
    vi.stubEnv('INDEXER_CATCHUP_WORKERS_TESTNET', '');
    vi.stubEnv('INDEXER_CATCHUP_WORKERS_MAINNET', '');
    vi.stubEnv('INDEXER_CATCHUP_WORKERS_DEVNET', '');
  });

  afterEach(() => vi.unstubAllEnvs());

  it('uses the selected network override instead of the default worker count', async () => {
    vi.stubEnv('INDEXER_CATCHUP_WORKERS_TESTNET', '2');

    const config = await loadConfig();

    expect(config.indexerCatchupWorkers).toBe(2);
  });

  it('falls back to the default when the selected network has no override', async () => {
    const config = await loadConfig();

    expect(config.indexerCatchupWorkers).toBe(8);
  });

  it('validates overrides for every supported network', async () => {
    vi.stubEnv('INDEXER_CATCHUP_WORKERS_DEVNET', '33');

    await expect(loadConfig()).rejects.toThrow(/Number must be less than or equal to 32/);
  });
});
