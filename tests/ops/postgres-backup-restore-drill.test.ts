import { afterEach, describe, expect, it } from 'vitest';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

const scriptPath = path.resolve(__dirname, '../../scripts/postgres-backup-restore-drill.sh');
const temporaryDirectories: string[] = [];

function createCommandBin(failCommand?: string) {
  const directory = mkdtempSync(path.join(tmpdir(), 'postgres-drill-test-'));
  temporaryDirectories.push(directory);
  const logPath = path.join(directory, 'commands.log');

  for (const command of ['pg_dump', 'pg_restore', 'psql']) {
    const source =
      command === 'pg_dump'
        ? `printf '%s\\n' "$*" >> "$MOCK_LOG"\nfor arg in "$@"; do case "$arg" in --file=*) touch "\${arg#--file=}" ;; esac; done`
        : `printf '%s\\n' "$*" >> "$MOCK_LOG"`;
    const failure =
      command === 'pg_restore'
        ? `if [ "\${FAIL_COMMAND:-}" = "pg_restore" ] && [ "$1" != "--list" ]; then exit 17; fi`
        : `if [ "\${FAIL_COMMAND:-}" = "${command}" ]; then exit 17; fi`;
    writeFileSync(
      path.join(directory, command),
      `#!/bin/sh\n${source}\n${failure}\n`,
    );
    chmodSync(path.join(directory, command), 0o755);
  }

  return { directory, logPath };
}

function runDrill(directory: string, logPath: string, ...args: string[]) {
  return spawnSync('bash', [scriptPath, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${directory}:${process.env.PATH}`,
      MOCK_LOG: logPath,
      FAIL_COMMAND: process.env.FAIL_COMMAND,
    },
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('PostgreSQL backup-restore drill', () => {
  const sourceUrl = 'postgresql://source-user:source-password@db.example/source';
  const restoreUrl = 'postgresql://restore-user:restore-password@localhost/drill';

  it('backs up, restores, checks connectivity, and removes the temporary archive', () => {
    const { directory, logPath } = createCommandBin();
    const result = runDrill(directory, logPath, sourceUrl, restoreUrl);
    const calls = readFileSync(logPath, 'utf8');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('PostgreSQL backup-restore drill passed.');
    expect(result.stdout).not.toContain('source-password');
    expect(calls).toContain(`--format=custom --no-owner --no-privileges --file=`);
    expect(calls).toContain(`--exit-on-error --no-owner --no-privileges --dbname=${restoreUrl}`);
    expect(calls).toContain('--command=SELECT 1');
    const archivePath = calls.match(/--file=(\S+)/)?.[1];
    expect(archivePath).toBeDefined();
    expect(archivePath && existsSync(archivePath)).toBe(false);
  });

  it('rejects missing arguments and source/target collisions', () => {
    const { directory, logPath } = createCommandBin();

    expect(runDrill(directory, logPath).status).toBe(2);
    expect(runDrill(directory, logPath, sourceUrl, sourceUrl).stderr).toContain(
      'must be different databases',
    );
  });

  it.each(['pg_dump', 'pg_restore', 'psql'])('fails when %s reports an error', (command) => {
    const { directory, logPath } = createCommandBin(command);
    const result = spawnSync('bash', [scriptPath, sourceUrl, restoreUrl], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
        MOCK_LOG: logPath,
        FAIL_COMMAND: command,
      },
    });

    expect(result.status).toBe(17);
    expect(result.stdout).not.toContain('drill passed');
  });
});
