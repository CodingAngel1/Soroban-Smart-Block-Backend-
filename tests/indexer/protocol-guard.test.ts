import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getLatestLedger } = vi.hoisted(() => ({
  getLatestLedger: vi.fn(),
}));

vi.mock('../../src/indexer/rpc', () => ({
  rpc: { getLatestLedger },
}));

describe('protocol upgrade compatibility guard', () => {
  beforeEach(() => {
    vi.resetModules();
    getLatestLedger.mockReset();
  });

  async function loadGuard() {
    return import('../../src/indexer/protocol-guard');
  }

  it('reports validated features for supported protocols', async () => {
    getLatestLedger.mockResolvedValue({ protocolVersion: 21 });
    const { getProtocolStatus } = await loadGuard();

    await expect(getProtocolStatus()).resolves.toEqual({
      currentVersion: 21,
      minSupported: 20,
      maxValidated: 21,
      isSupported: true,
      knownFeatures: [
        'soroban_v1',
        'invoke_host_function',
        'soroban_v2',
        'transaction_meta_v3',
        'diagnostic_events',
      ],
      warning: null,
    });
  });

  it('does not treat an anticipated, unvalidated protocol as supported', async () => {
    getLatestLedger.mockResolvedValue({ protocolVersion: 22 });
    const { getProtocolStatus } = await loadGuard();

    const status = await getProtocolStatus();
    expect(status.isSupported).toBe(false);
    expect(status.maxValidated).toBe(21);
    expect(status.knownFeatures).not.toContain('soroban_v3');
    expect(status.warning).toContain('highest validated version (21)');
  });

  it('reports protocols below the Soroban minimum as unsupported', async () => {
    getLatestLedger.mockResolvedValue({ protocol_version: 19 });
    const { getProtocolStatus } = await loadGuard();

    const status = await getProtocolStatus();
    expect(status.isSupported).toBe(false);
    expect(status.warning).toContain('below minimum supported (20)');
  });

  it('falls back safely when the RPC cannot report a protocol version', async () => {
    getLatestLedger.mockRejectedValue(new Error('RPC unavailable'));
    const { getProtocolStatus } = await loadGuard();

    const status = await getProtocolStatus();
    expect(status.currentVersion).toBe(0);
    expect(status.isSupported).toBe(false);
  });

  it('returns the fallback for XDR structural failures without throwing', async () => {
    const { safeXdrParse } = await loadGuard();
    const fallback = { decoded: false };

    expect(() =>
      safeXdrParse(() => {
        throw new Error('unknown arm in XDR union');
      }, fallback),
    ).not.toThrow();
    expect(
      safeXdrParse(() => {
        throw new Error('unknown arm in XDR union');
      }, fallback),
    ).toBe(fallback);
  });
});
