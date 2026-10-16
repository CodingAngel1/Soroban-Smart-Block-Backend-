import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('axios', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

vi.mock('../../src/db', () => ({
  prismaRead: {
    ledger: { count: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    transaction: { count: vi.fn() },
    event: { groupBy: vi.fn() },
  },
}));

vi.mock('../../src/indexer/rpc', () => ({
  fetchEvents: vi.fn(),
}));

vi.mock('../../src/indexer/repair', () => ({
  triggerAutomatedGapRepair: vi.fn(),
}));

vi.mock('../../src/config', () => ({
  config: { horizonUrl: 'https://horizon-testnet.stellar.org' },
}));

vi.mock('../../src/scheduler/cron-scheduler', () => ({
  scheduler: { recordHeartbeat: vi.fn() },
}));

import { prismaRead } from '../../src/db';
import { fetchEvents } from '../../src/indexer/rpc';
import { findEventCountDiscrepancies, runReconciliation } from '../../src/indexer/reconciliation';

const event = (ledgerSequence: number) => ({
  contractId: 'contract',
  transactionHash: `tx-${ledgerSequence}`,
  ledgerSequence,
  ledgerCloseTime: new Date(),
  topics: [],
  data: '',
  pagingToken: `${ledgerSequence}`,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(axios.get).mockResolvedValue({
    data: { _embedded: { records: [{ sequence: '1000' }] } },
  });
  vi.mocked(prismaRead.ledger.count).mockResolvedValue(3);
  vi.mocked(prismaRead.transaction.count).mockResolvedValue(2);
  vi.mocked(prismaRead.ledger.findFirst).mockResolvedValue({ sequence: 1000 } as never);
  vi.mocked(prismaRead.ledger.findMany).mockResolvedValue(
    [998, 999, 1000].map((sequence) => ({ sequence })) as never,
  );
  vi.mocked(prismaRead.event.groupBy).mockResolvedValue([
    { ledgerSequence: 999, _count: { _all: 1 } },
  ] as never);
  vi.mocked(fetchEvents).mockResolvedValue([event(999), event(1000)]);
});

describe('indexed event total reconciliation', () => {
  it('reports count mismatches per ledger, including upstream-only ledgers', () => {
    expect(
      findEventCountDiscrepancies(
        [
          { ledgerSequence: 10, count: 2 },
          { ledgerSequence: 11, count: 1 },
        ],
        new Map([
          [10, 1],
          [12, 3],
        ]),
      ),
    ).toEqual([
      { ledgerSequence: 10, indexedCount: 2, upstreamCount: 1 },
      { ledgerSequence: 11, indexedCount: 1, upstreamCount: 0 },
      { ledgerSequence: 12, indexedCount: 0, upstreamCount: 3 },
    ]);
  });

  it('includes local/upstream event totals and ledger-level differences in the report', async () => {
    const report = await runReconciliation(2);

    expect(fetchEvents).toHaveBeenCalledWith(999, 1000);
    expect(prismaRead.event.groupBy).toHaveBeenCalledWith({
      by: ['ledgerSequence'],
      where: { ledgerSequence: { gte: 999, lte: 1000 } },
      _count: { _all: true },
    });
    expect(report.localEventCount).toBe(1);
    expect(report.upstreamEventCount).toBe(2);
    expect(report.eventCountDiscrepancies).toEqual([
      { ledgerSequence: 1000, indexedCount: 0, upstreamCount: 1 },
    ]);
    expect(report.healthy).toBe(false);
  });

  it('returns an unhealthy report when upstream event pagination fails', async () => {
    vi.mocked(fetchEvents).mockRejectedValue(new Error('RPC unavailable'));

    const report = await runReconciliation(2);

    expect(report.healthy).toBe(false);
    expect(
      report.discrepancies.some((message) =>
        message.includes('Failed to fetch upstream event totals for range 999–1000'),
      ),
    ).toBe(true);
    expect(report.eventCountDiscrepancies).toEqual([]);
  });
});
