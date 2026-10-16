import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config', () => ({
  config: { indexerStartLedger: 100 },
}));

vi.mock('../../src/db', () => ({
  prismaWrite: { $queryRaw: vi.fn() },
}));

import { prismaWrite } from '../../src/db';
import { getIndexerPauseState, setIndexerPaused } from '../../src/indexer/worker-control';

const originalNetwork = process.env.STELLAR_NETWORK;

beforeEach(() => {
  process.env.STELLAR_NETWORK = 'testnet';
  vi.mocked(prismaWrite.$queryRaw).mockReset();
});

afterEach(() => {
  if (originalNetwork === undefined) delete process.env.STELLAR_NETWORK;
  else process.env.STELLAR_NETWORK = originalNetwork;
});

describe('persistent indexer worker pause state', () => {
  it('reads the pause state from the active network row', async () => {
    vi.mocked(prismaWrite.$queryRaw).mockResolvedValue([{ paused: true }] as never);

    await expect(getIndexerPauseState()).resolves.toEqual({ network: 'testnet', paused: true });
    expect(prismaWrite.$queryRaw).toHaveBeenCalled();
    expect(prismaWrite.$queryRaw.mock.calls[0]).toContain('testnet');
  });

  it('writes pause state with an idempotent network-scoped upsert', async () => {
    vi.mocked(prismaWrite.$queryRaw).mockResolvedValue([{ paused: false }] as never);

    await expect(setIndexerPaused(false)).resolves.toEqual({
      network: 'testnet',
      paused: false,
    });
    const [queryParts, ...parameters] = prismaWrite.$queryRaw.mock.calls[0];
    expect(queryParts.join(' ')).toContain('ON CONFLICT ("id")');
    expect(parameters).toContain('testnet');
    expect(parameters).toContain(100);
    expect(parameters).toContain(false);
  });

  it('surfaces network identity conflicts and database failures', async () => {
    vi.mocked(prismaWrite.$queryRaw).mockResolvedValue([]);
    await expect(setIndexerPaused(true)).rejects.toThrow(
      'Indexer state row belongs to a different network than testnet',
    );

    vi.mocked(prismaWrite.$queryRaw).mockRejectedValue(new Error('database unavailable'));
    await expect(getIndexerPauseState()).rejects.toThrow('database unavailable');
  });
});
