import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { registry } from '../../src/metrics';
import { recordIndexerFreshness } from '../../src/indexer/freshness';

describe('indexer freshness metrics', () => {
  beforeEach(() => {
    registry.resetMetrics();
  });

  it('records the committed ledger, close time, and network-specific lag', async () => {
    const closeTime = new Date('2026-10-15T12:00:00.000Z');
    recordIndexerFreshness('testnet', 120, closeTime, 125);

    expect(await registry.getSingleMetricAsString('indexer_last_ledger')).toContain(
      'indexer_last_ledger{network="testnet"} 120',
    );
    expect(await registry.getSingleMetricAsString('indexer_ingestion_lag_ledgers')).toContain(
      'indexer_ingestion_lag_ledgers{network="testnet"} 5',
    );
    expect(
      await registry.getSingleMetricAsString('indexer_ledger_close_timestamp_seconds'),
    ).toContain('indexer_ledger_close_timestamp_seconds{network="testnet"} 1792065600');
  });

  it('does not report negative lag when the local cursor is ahead of the RPC tip', async () => {
    recordIndexerFreshness('mainnet', 500, new Date('2026-10-15T12:00:00.000Z'), 499);

    expect(await registry.getSingleMetricAsString('indexer_ingestion_lag_ledgers')).toContain(
      'indexer_ingestion_lag_ledgers{network="mainnet"} 0',
    );
  });

  it('preserves the last lag sample when the RPC tip is unavailable', async () => {
    recordIndexerFreshness('devnet', 80, new Date('2026-10-15T12:00:00.000Z'), 100);
    recordIndexerFreshness('devnet', 90, new Date('2026-10-15T12:01:00.000Z'));

    expect(await registry.getSingleMetricAsString('indexer_last_ledger')).toContain(
      'indexer_last_ledger{network="devnet"} 90',
    );
    expect(await registry.getSingleMetricAsString('indexer_ingestion_lag_ledgers')).toContain(
      'indexer_ingestion_lag_ledgers{network="devnet"} 20',
    );
  });

  it('defines network-specific freshness and ledger-lag alert thresholds', () => {
    const rules = readFileSync('prometheus/alerts.yml', 'utf8');

    expect(rules).toContain('IndexerIngestionLagWarning');
    expect(rules).toContain('indexer_ingestion_lag_ledgers{network=~"mainnet|testnet"} > 50');
    expect(rules).toContain('indexer_ingestion_lag_ledgers{network="devnet"} > 300');
    expect(rules).toContain('indexer:freshness_age_seconds{network=~"mainnet|testnet"} > 60');
    expect(rules).toContain('indexer:freshness_age_seconds{network="devnet"} > 1800');
  });
});
