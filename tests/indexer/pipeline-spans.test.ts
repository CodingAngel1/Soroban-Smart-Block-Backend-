import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  spans: [] as Array<{ name: string; attributes: Record<string, unknown> }>,
  ledgerUpsert: vi.fn(),
}));

vi.mock('../../src/config', () => ({
  config: {
    indexerBatchSize: 10,
    indexerCatchupWorkers: 1,
    indexerStartLedger: 1,
    indexerReorgProtectionDepth: 10,
    profile: { name: 'testnet' },
  },
}));

vi.mock('../../src/db', () => ({
  prismaRead: {
    ledger: { findUnique: vi.fn().mockResolvedValue(null) },
  },
  prismaWrite: {
    ledger: { upsert: mocks.ledgerUpsert },
  },
}));

vi.mock('../../src/metrics', () => ({
  indexerPipelineStageDuration: { startTimer: vi.fn(() => vi.fn()) },
  indexerPipelineStageLag: { set: vi.fn() },
  indexerPipelineStageProcessedTotal: { inc: vi.fn() },
}));

vi.mock('../../src/tracer', () => ({
  withSpan: vi.fn(async (name: string, operation: (span: unknown) => Promise<unknown>) => {
    const attributes: Record<string, unknown> = {};
    mocks.spans.push({ name, attributes });
    return operation({
      setAttributes: (spanAttributes: Record<string, unknown>) =>
        Object.assign(attributes, spanAttributes),
      setAttribute: (key: string, value: unknown) => {
        attributes[key] = value;
      },
    });
  }),
}));

vi.mock('../../src/indexer/rpc', () => ({
  fetchLedgerMetadataBatch: vi.fn().mockResolvedValue(
    new Map([
      [
        100,
        {
          sequence: 100,
          hash: 'ledger-hash',
          previousLedgerHash: 'previous-hash',
          closeTime: new Date('2025-01-01T00:00:00Z'),
          txCount: 0,
        },
      ],
    ]),
  ),
  fetchLedgerMetadata: vi.fn(),
  fetchEvents: vi.fn().mockResolvedValue([]),
  getLatestLedger: vi.fn().mockResolvedValue(100),
  getRpcWebsocketUrl: vi.fn(),
  getTransaction: vi.fn(),
  getTransactionFromHorizon: vi.fn(),
}));

vi.mock('../../src/p2p', () => ({
  amIResponsibleFor: vi.fn().mockResolvedValue(true),
  getRangeCursor: vi.fn(),
  isP2pEnabled: vi.fn().mockReturnValue(false),
  setRangeCursor: vi.fn(),
}));

vi.mock('../../src/realtime/eventHub', () => ({
  realtimeHub: { publishLedger: vi.fn(), publishContractEvent: vi.fn() },
}));

vi.mock('../../src/indexer/decoder', () => ({
  decodeTransaction: vi.fn(),
  decodeEvent: vi.fn(),
}));

vi.mock('../../src/indexer/zkp-verifier', () => ({
  decodeZkpVerification: vi.fn(),
  recordZkpVerification: vi.fn(),
}));

vi.mock('../../src/indexer/aa-indexer', () => ({
  processAaTransaction: vi.fn(),
}));

vi.mock('../../src/feed/orchestrator', () => ({
  feedOrchestrator: { publishTransaction: vi.fn(), publishEvent: vi.fn(), shutdown: vi.fn() },
}));

vi.mock('../../src/webhooks/dispatcher', () => ({
  dispatchWebhooks: vi.fn(),
}));

vi.mock('../../src/indexer/audit-pipeline', () => ({
  enqueueInitialAudit: vi.fn(),
}));

vi.mock('../../src/indexer/savedSearchRunner', () => ({
  startSavedSearchScheduler: vi.fn(),
  stopSavedSearchScheduler: vi.fn(),
}));

vi.mock('../../src/services/search/full-text-search', () => ({
  indexContract: vi.fn(),
  indexEvent: vi.fn(),
  indexTransaction: vi.fn(),
  indexSafely: vi.fn(),
}));

describe('indexer pipeline spans', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.spans.length = 0;
    mocks.ledgerUpsert.mockResolvedValue({});
  });

  it('traces metadata fetch, ledger persistence, and event fetch with ledger/network attributes', async () => {
    const { processLedgerRange } = await import('../../src/indexer/indexer');

    await processLedgerRange(100, 100, { force: true });

    const stages = mocks.spans.map(({ name }) => name);
    expect(stages).toContain('indexer.ledger_range');
    expect(stages).toContain('indexer.ledger.fetch_metadata');
    expect(stages).toContain('indexer.ledger.persist');
    expect(stages).toContain('indexer.events.fetch');
    expect(mocks.spans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'indexer.ledger.persist',
          attributes: expect.objectContaining({
            'ledger.sequence': 100,
            'network.name': 'testnet',
          }),
        }),
      ]),
    );
  });

  it('propagates persistence failures through the ledger persistence span', async () => {
    mocks.ledgerUpsert.mockRejectedValue(new Error('database unavailable'));
    const { processLedgerRange } = await import('../../src/indexer/indexer');

    await expect(processLedgerRange(100, 100, { force: true })).rejects.toThrow(
      'database unavailable',
    );
    expect(mocks.spans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'indexer.ledger.persist',
          attributes: expect.objectContaining({ 'ledger.sequence': 100 }),
        }),
      ]),
    );
  });
});
