import { describe, expect, it, vi } from 'vitest';
import {
  processCheckpointedRange,
  type CatchUpCheckpoint,
  type CatchUpCheckpointStore,
} from '../../src/indexer/catch-up';

function createStore(initial: CatchUpCheckpoint | null = null) {
  let checkpoint = initial;
  const findUnique = vi.fn(async () => checkpoint);
  const upsert = vi.fn(async (args: Parameters<CatchUpCheckpointStore['upsert']>[0]) => {
    checkpoint = {
      lastCommittedLedger: args.update.lastCommittedLedger,
      completed: args.update.completed,
    };
    return checkpoint;
  });
  const store: CatchUpCheckpointStore = { findUnique, upsert };
  return { store, findUnique, upsert, getCheckpoint: () => checkpoint };
}

describe('checkpointed indexer catch-up', () => {
  it('resumes from the last committed batch and upserts one stable network window', async () => {
    const { store, upsert } = createStore({
      lastCommittedLedger: 104,
      completed: false,
    });
    const processRange = vi.fn(async () => undefined);

    await processCheckpointedRange({
      network: 'testnet',
      rangeStart: 1,
      rangeEnd: 10_000,
      workStart: 100,
      workEnd: 109,
      batchSize: 3,
      store,
      processRange,
    });

    expect(processRange.mock.calls).toEqual([
      [105, 107],
      [108, 109],
    ]);
    expect(upsert).toHaveBeenCalledTimes(3);
    expect(upsert.mock.calls[0][0].where).toEqual({
      network_rangeStart_rangeEnd: { network: 'testnet', rangeStart: 1, rangeEnd: 10_000 },
    });
    expect(upsert.mock.calls.at(-1)?.[0].update).toEqual({
      lastCommittedLedger: 109,
      completed: false,
    });
  });

  it('does not rewrite a completed window', async () => {
    const { store, upsert } = createStore({ lastCommittedLedger: 10_000, completed: true });
    const processRange = vi.fn(async () => undefined);

    await processCheckpointedRange({
      network: 'mainnet',
      rangeStart: 1,
      rangeEnd: 10_000,
      workStart: 1,
      workEnd: 10_000,
      batchSize: 100,
      store,
      processRange,
    });

    expect(processRange).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('does not advance the checkpoint when processing a batch fails', async () => {
    const { store, upsert } = createStore();
    const processRange = vi
      .fn<(_: number, __: number) => Promise<void>>()
      .mockRejectedValueOnce(new Error('upstream unavailable'));

    await expect(
      processCheckpointedRange({
        network: 'mainnet',
        rangeStart: 1,
        rangeEnd: 10_000,
        workStart: 1,
        workEnd: 3,
        batchSize: 2,
        store,
        processRange,
      }),
    ).rejects.toThrow('upstream unavailable');

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0].update).toEqual({
      lastCommittedLedger: null,
      completed: false,
    });
  });

  it('fails closed when checkpoint persistence fails', async () => {
    const { store, upsert } = createStore();
    upsert.mockRejectedValueOnce(new Error('database unavailable'));
    const processRange = vi.fn(async () => undefined);

    await expect(
      processCheckpointedRange({
        network: 'mainnet',
        rangeStart: 1,
        rangeEnd: 10_000,
        workStart: 1,
        workEnd: 2,
        batchSize: 2,
        store,
        processRange,
      }),
    ).rejects.toThrow('database unavailable');

    expect(processRange).not.toHaveBeenCalled();
  });
});
