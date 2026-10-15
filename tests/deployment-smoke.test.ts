import { describe, expect, it, vi } from 'vitest';
import {
  parseExpectedMigrations,
  runDeploymentSmokeChecks,
  type DeploymentSmokeDependencies,
  type MigrationStatus,
} from '../src/deployment-smoke';

const applied = (migrationName: string): MigrationStatus => ({
  migrationName,
  finishedAt: new Date(),
  rolledBackAt: null,
});

function dependencies(overrides: Partial<DeploymentSmokeDependencies> = {}) {
  return {
    checkLiveness: vi.fn().mockResolvedValue(undefined),
    getMigrationStatus: vi.fn().mockResolvedValue([applied('migration-1')]),
    checkLedgerSchema: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('deployment smoke checks', () => {
  it('parses a non-empty list of unique expected migrations', () => {
    expect(parseExpectedMigrations('["migration-1","migration-2"]')).toEqual([
      'migration-1',
      'migration-2',
    ]);
  });

  it.each([
    [undefined, /EXPECTED_MIGRATIONS/],
    ['not-json', /JSON array/],
    ['[]', /non-empty/],
    ['["migration-1","migration-1"]', /unique/],
  ])('rejects malformed expected migrations: %s', (value, message) => {
    expect(() => parseExpectedMigrations(value)).toThrow(message);
  });

  it('checks the API, all migrations, and a representative migrated table', async () => {
    const checks = dependencies({
      getMigrationStatus: vi
        .fn()
        .mockResolvedValue([applied('migration-1'), applied('migration-2')]),
    });

    await expect(
      runDeploymentSmokeChecks(['migration-1', 'migration-2'], checks),
    ).resolves.toBeUndefined();
    expect(checks.checkLiveness).toHaveBeenCalledOnce();
    expect(checks.getMigrationStatus).toHaveBeenCalledOnce();
    expect(checks.checkLedgerSchema).toHaveBeenCalledOnce();
  });

  it('fails with missing and incomplete migrations before checking application tables', async () => {
    const checks = dependencies({
      getMigrationStatus: vi
        .fn()
        .mockResolvedValue([
          applied('migration-1'),
          { migrationName: 'migration-in-progress', finishedAt: null, rolledBackAt: null },
          { migrationName: 'migration-rolled-back', finishedAt: null, rolledBackAt: new Date() },
        ]),
    });

    await expect(runDeploymentSmokeChecks(['migration-1', 'migration-2'], checks)).rejects.toThrow(
      /missing migrations: migration-2; incomplete migrations: migration-in-progress/,
    );
    expect(checks.checkLedgerSchema).not.toHaveBeenCalled();
  });

  it('surfaces API and migrated-table failures', async () => {
    const apiFailure = dependencies({
      checkLiveness: vi.fn().mockRejectedValue(new Error('API unavailable')),
    });
    await expect(runDeploymentSmokeChecks(['migration-1'], apiFailure)).rejects.toThrow(
      'API unavailable',
    );
    expect(apiFailure.getMigrationStatus).not.toHaveBeenCalled();

    const tableFailure = dependencies({
      checkLedgerSchema: vi.fn().mockRejectedValue(new Error('ledger table missing')),
    });
    await expect(runDeploymentSmokeChecks(['migration-1'], tableFailure)).rejects.toThrow(
      'ledger table missing',
    );
  });
});
