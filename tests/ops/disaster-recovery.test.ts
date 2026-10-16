import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const runbook = readFileSync(path.resolve(__dirname, '../../docs/disaster-recovery.md'), 'utf8');

describe('disaster recovery objectives', () => {
  it('documents the approved RPO and RTO limits', () => {
    expect(runbook).toMatch(/RPO[\s\S]*?15 minutes/);
    expect(runbook).toMatch(/RTO[\s\S]*?60 minutes/);
  });

  it('requires PITR verification separate from a logical restore drill', () => {
    expect(runbook).toContain('does not prove PITR');
    expect(runbook).toMatch(/Do not use this\s+logical backup as\s+evidence that PITR passed/);
    expect(runbook).toContain('latest restorable timestamp');
  });

  it('measures service readiness and network-specific indexer recovery', () => {
    expect(runbook).toContain('`/readyz`');
    expect(runbook).toMatch(/testnet, mainnet, or\s+devnet/);
    expect(runbook).toContain('configured RPC endpoint and rate limits');
  });
});
