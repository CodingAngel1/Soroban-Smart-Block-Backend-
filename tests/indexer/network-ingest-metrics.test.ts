import { beforeEach, describe, expect, it } from 'vitest';
import { registry, setIndexerProgress } from '../../src/metrics';

describe('per-network indexer progress metrics', () => {
  beforeEach(() => registry.resetMetrics());

  it('publishes independent ledger cursor and non-negative lag series per network', async () => {
    setIndexerProgress('testnet', 100, 112);
    setIndexerProgress('mainnet', 900, 895);

    const lastLedger = await registry.getSingleMetricAsString('indexer_last_ledger');
    const lag = await registry.getSingleMetricAsString('indexer_ingestion_lag_ledgers');

    expect(lastLedger).toContain('indexer_last_ledger{network="testnet"} 100');
    expect(lastLedger).toContain('indexer_last_ledger{network="mainnet"} 900');
    expect(lag).toContain('indexer_ingestion_lag_ledgers{network="testnet"} 12');
    expect(lag).toContain('indexer_ingestion_lag_ledgers{network="mainnet"} 0');
  });
});
