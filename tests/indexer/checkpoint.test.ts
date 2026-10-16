import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaWriteMock } = vi.hoisted(() => ({
  prismaWriteMock: { $transaction: vi.fn() },
}));

vi.mock('../../src/db', () => ({ prismaWrite: prismaWriteMock }));

import { commitCatchUpCheckpoint } from '../../src/indexer/checkpoint';

const indexedRecords = {
  network: 'testnet',
  ledgerSequences: [20, 21],
  transactionHashes: ['tx-20', 'tx-21'],
  eventIds: ['event-20', 'event-21'],
};

function createTransactionClient(counts: [number, number, number]) {
  return {
    ledger: { count: vi.fn().mockResolvedValue(counts[0]) },
    transaction: { count: vi.fn().mockResolvedValue(counts[1]) },
    event: { count: vi.fn().mockResolvedValue(counts[2]) },
    catchUpCheckpoint: { upsert: vi.fn().mockResolvedValue({}) },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('commitCatchUpCheckpoint', () => {
  it('validates indexed rows and commits the network-scoped checkpoint in one transaction', async () => {
    const tx = createTransactionClient([2, 2, 2]);
    prismaWriteMock.$transaction.mockImplementation(async (callback) => callback(tx));

    await commitCatchUpCheckpoint(20, 21, 'testnet', 21, true, indexedRecords);

    expect(tx.ledger.count).toHaveBeenCalledWith({
      where: { network: 'testnet', sequence: { in: [20, 21] } },
    });
    expect(tx.transaction.count).toHaveBeenCalledWith({
      where: { network: 'testnet', hash: { in: ['tx-20', 'tx-21'] } },
    });
    expect(tx.event.count).toHaveBeenCalledWith({
      where: { network: 'testnet', id: { in: ['event-20', 'event-21'] } },
    });
    expect(tx.catchUpCheckpoint.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          network_rangeStart_rangeEnd: { network: 'testnet', rangeStart: 20, rangeEnd: 21 },
        },
        create: expect.objectContaining({
          network: 'testnet',
          lastCommittedLedger: 21,
          completed: true,
        }),
      }),
    );
  });

  it('does not advance progress if any indexed rows are missing', async () => {
    const tx = createTransactionClient([1, 2, 2]);
    prismaWriteMock.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(
      commitCatchUpCheckpoint(20, 21, 'testnet', 21, true, indexedRecords),
    ).rejects.toThrow(/ledger=1\/2/);

    expect(tx.catchUpCheckpoint.upsert).not.toHaveBeenCalled();
  });

  it('propagates checkpoint write failures instead of reporting success', async () => {
    const tx = createTransactionClient([2, 2, 2]);
    tx.catchUpCheckpoint.upsert.mockRejectedValue(new Error('database unavailable'));
    prismaWriteMock.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(
      commitCatchUpCheckpoint(20, 21, 'testnet', 21, true, indexedRecords),
    ).rejects.toThrow('database unavailable');
  });

  it('rejects records from another network before updating the checkpoint', async () => {
    const tx = createTransactionClient([2, 2, 2]);
    prismaWriteMock.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(
      commitCatchUpCheckpoint(20, 21, 'mainnet', 21, true, indexedRecords),
    ).rejects.toThrow(/records belong to testnet/);

    expect(tx.catchUpCheckpoint.upsert).not.toHaveBeenCalled();
  });
});
