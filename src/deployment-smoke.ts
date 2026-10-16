export interface MigrationStatus {
  migrationName: string;
  finishedAt: Date | null;
  rolledBackAt: Date | null;
}

export interface DeploymentSmokeDependencies {
  checkLiveness(): Promise<void>;
  getMigrationStatus(): Promise<MigrationStatus[]>;
  checkLedgerSchema(): Promise<void>;
}

function isMigrationNameList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((migration) => typeof migration === 'string' && migration.length > 0) &&
    new Set(value).size === value.length
  );
}

export function parseExpectedMigrations(value: string | undefined): string[] {
  if (!value) throw new Error('EXPECTED_MIGRATIONS must contain the migration directory names');

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('EXPECTED_MIGRATIONS must be a JSON array of migration names');
  }

  if (!isMigrationNameList(parsed)) {
    throw new Error('EXPECTED_MIGRATIONS must be a non-empty array of unique migration names');
  }

  return parsed;
}

export async function runDeploymentSmokeChecks(
  expectedMigrations: string[],
  dependencies: DeploymentSmokeDependencies,
): Promise<void> {
  if (expectedMigrations.length === 0) {
    throw new Error('Deployment smoke test requires at least one expected migration');
  }

  await dependencies.checkLiveness();

  const migrationStatus = await dependencies.getMigrationStatus();
  const appliedMigrations = new Set(
    migrationStatus
      .filter((migration) => migration.finishedAt !== null && migration.rolledBackAt === null)
      .map((migration) => migration.migrationName),
  );
  const missingMigrations = expectedMigrations.filter((name) => !appliedMigrations.has(name));
  const incompleteMigrations = migrationStatus
    .filter((migration) => migration.finishedAt === null && migration.rolledBackAt === null)
    .map((migration) => migration.migrationName);

  if (missingMigrations.length > 0 || incompleteMigrations.length > 0) {
    const details = [
      ...(missingMigrations.length > 0
        ? [`missing migrations: ${missingMigrations.join(', ')}`]
        : []),
      ...(incompleteMigrations.length > 0
        ? [`incomplete migrations: ${incompleteMigrations.join(', ')}`]
        : []),
    ];
    throw new Error(`Deployment database smoke failed (${details.join('; ')})`);
  }

  await dependencies.checkLedgerSchema();
}

async function main(): Promise<void> {
  const expectedMigrations = parseExpectedMigrations(process.env.EXPECTED_MIGRATIONS);
  const apiUrl = process.env.SMOKE_API_URL ?? 'http://127.0.0.1:3000';
  const { prismaWrite } = await import('./db');

  try {
    await runDeploymentSmokeChecks(expectedMigrations, {
      checkLiveness: async () => {
        const response = await fetch(`${apiUrl}/healthz`, {
          signal: AbortSignal.timeout(5_000),
        });
        if (!response.ok) {
          throw new Error(`API liveness check returned HTTP ${response.status}`);
        }
        const body: unknown = await response.json();
        if (
          typeof body !== 'object' ||
          body === null ||
          !('status' in body) ||
          body.status !== 'alive'
        ) {
          throw new Error('API liveness check did not report an alive process');
        }
      },
      getMigrationStatus: async () =>
        prismaWrite.$queryRaw<MigrationStatus[]>`
          SELECT
            migration_name AS "migrationName",
            finished_at AS "finishedAt",
            rolled_back_at AS "rolledBackAt"
          FROM "_prisma_migrations"
        `,
      checkLedgerSchema: async () => {
        await prismaWrite.$queryRaw`SELECT sequence FROM "_ledgers" LIMIT 0`;
      },
    });
    process.stdout.write(
      `Deployment smoke passed: ${expectedMigrations.length} migrations applied and API/database checks succeeded.\n`,
    );
  } finally {
    await prismaWrite.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `Deployment smoke failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
