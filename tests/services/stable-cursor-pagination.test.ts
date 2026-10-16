import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventRepository } from '../../src/repositories/event.repository';
import type { TransactionRepository } from '../../src/repositories/transaction.repository';
import { eventRepository } from '../../src/repositories/event.repository';
import { transactionRepository } from '../../src/repositories/transaction.repository';
import { EventService } from '../../src/services/event.service';
import { TransactionService } from '../../src/services/transaction.service';
import { decodeStableCursor, encodeStableCursor } from '../../src/utils/stable-cursor';

const dbMocks = vi.hoisted(() => ({
  transactionFindMany: vi.fn(),
  eventFindMany: vi.fn(),
}));

vi.mock('../../src/db', () => ({
  prismaRead: {
    transaction: { findMany: dbMocks.transactionFindMany },
    event: { findMany: dbMocks.eventFindMany },
  },
}));

vi.mock('../../src/indexer/bn254-tracker', () => ({
  getBn254ExemptionByTx: vi.fn(),
}));

const transactionRepo = {
  findMany: vi.fn(),
  count: vi.fn(),
  findByHashWithEvents: vi.fn(),
} satisfies TransactionRepository;

const eventRepo = {
  findManySummary: vi.fn(),
  count: vi.fn(),
  findById: vi.fn(),
} satisfies EventRepository;

const transactionService = new TransactionService(transactionRepo);
const eventService = new EventService(eventRepo);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('stable cursor pagination contract', () => {
  it('returns the common envelope and opaque continuation token for transactions', async () => {
    const firstRow = { id: 'tx-2', hash: 'hash-2', ledgerSequence: 20 };
    transactionRepo.findMany.mockResolvedValueOnce([firstRow, { id: 'tx-1' }]);

    const firstPage = await transactionService.listTransactions({
      pagination: 'cursor',
      limit: 1,
    });

    expect(firstPage).toEqual({
      data: [{ hash: 'hash-2', ledgerSequence: 20 }],
      nextCursor: encodeStableCursor('transactions', {
        ledgerSequence: 20,
        id: 'tx-2',
      }),
      hasNext: true,
    });
    expect(transactionRepo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 2, includeCursorId: true }),
    );
    expect(transactionRepo.count).not.toHaveBeenCalled();

    transactionRepo.findMany.mockResolvedValueOnce([{ id: 'tx-1', hash: 'hash-1' }]);
    const lastPage = await transactionService.listTransactions({
      pagination: 'cursor',
      cursor: firstPage.nextCursor!,
      limit: 1,
    });

    expect(lastPage).toEqual({
      data: [{ hash: 'hash-1' }],
      nextCursor: null,
      hasNext: false,
    });
    expect(transactionRepo.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        after: { ledgerSequence: 20, id: 'tx-2' },
        take: 2,
      }),
    );
  });

  it('returns the same envelope for events and rejects malformed cursors', async () => {
    const firstEvent = {
      id: 'event-2',
      ledgerSequence: 20,
      transactionHash: 'hash-2',
    };
    eventRepo.findManySummary.mockResolvedValueOnce([firstEvent, { id: 'event-1' }]);

    const page = await eventService.listEvents({ pagination: 'cursor', limit: 1 });

    expect(Object.keys(page)).toEqual(['data', 'nextCursor', 'hasNext']);
    expect(page).toEqual({
      data: [firstEvent],
      nextCursor: encodeStableCursor('events', { ledgerSequence: 20, id: 'event-2' }),
      hasNext: true,
    });
    expect(eventRepo.count).not.toHaveBeenCalled();

    await expect(
      eventService.listEvents({ pagination: 'cursor', cursor: 'not-a-cursor' }),
    ).rejects.toThrow('Invalid cursor');
  });

  it('rejects a valid cursor issued for a different endpoint family', () => {
    const eventCursor = encodeStableCursor('events', { ledgerSequence: 1, id: 'event-1' });

    expect(() => decodeStableCursor(eventCursor, 'transactions')).toThrow('Invalid cursor');
  });

  it('uses exclusive composite keyset conditions for both repositories', async () => {
    dbMocks.transactionFindMany.mockResolvedValueOnce([]);
    dbMocks.eventFindMany.mockResolvedValueOnce([]);
    const after = { ledgerSequence: 20, id: 'row-2' };

    await transactionRepository.findMany({
      where: { status: 'success' },
      after,
      includeCursorId: true,
      take: 21,
    });
    await eventRepository.findManySummary({
      where: { eventType: 'transfer' },
      after,
      take: 21,
    });

    expect(dbMocks.transactionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { status: 'success' },
            {
              OR: [{ ledgerSequence: { lt: 20 } }, { ledgerSequence: 20, id: { lt: 'row-2' } }],
            },
          ],
        },
      }),
    );
    expect(dbMocks.eventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { eventType: 'transfer' },
            {
              OR: [{ ledgerSequence: { lt: 20 } }, { ledgerSequence: 20, id: { lt: 'row-2' } }],
            },
          ],
        },
      }),
    );
  });
});
