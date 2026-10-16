import { afterEach, describe, expect, it } from 'vitest';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

const scriptPath = path.resolve(__dirname, '../../scripts/rollback-release.sh');
const temporaryDirectories: string[] = [];

function createKubectl() {
  const directory = mkdtempSync(path.join(tmpdir(), 'rollback-test-'));
  temporaryDirectories.push(directory);
  const logPath = path.join(directory, 'kubectl.log');
  const kubectlPath = path.join(directory, 'kubectl');
  writeFileSync(logPath, '');
  writeFileSync(
    kubectlPath,
    `#!/bin/sh\nprintf '%s\\n' "$*" >> "$MOCK_LOG"\nif [ "$FAIL_CALL" = "$1 $2" ]; then exit 19; fi\n`,
  );
  chmodSync(kubectlPath, 0o755);
  return { directory, logPath };
}

function runRollback(
  directory: string,
  logPath: string,
  args: string[],
  failCall = '',
) {
  return spawnSync('bash', [scriptPath, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${directory}:${process.env.PATH}`,
      MOCK_LOG: logPath,
      FAIL_CALL: failCall,
    },
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('application release rollback', () => {
  it('undoes the previous revision and waits for rollout health', () => {
    const { directory, logPath } = createKubectl();
    const result = runRollback(directory, logPath, ['soroban', 'soroban-api']);
    const calls = readFileSync(logPath, 'utf8');

    expect(result.status).toBe(0);
    expect(calls).toContain('rollout undo deployment/soroban-api --namespace soroban');
    expect(calls).toContain(
      'rollout status deployment/soroban-api --namespace soroban --timeout=300s',
    );
    expect(result.stdout).toContain('Rollback completed successfully.');
  });

  it('can target a selected revision', () => {
    const { directory, logPath } = createKubectl();

    expect(
      runRollback(directory, logPath, ['soroban', 'soroban-api-mainnet', '12']).status,
    ).toBe(0);
    expect(readFileSync(logPath, 'utf8')).toContain('--to-revision=12');
  });

  it('rejects invalid names and revisions without invoking kubectl', () => {
    const { directory, logPath } = createKubectl();

    expect(runRollback(directory, logPath, ['Soroban', 'soroban-api']).status).toBe(2);
    expect(runRollback(directory, logPath, ['soroban', 'soroban-api', '0']).status).toBe(2);
    expect(readFileSync(logPath, 'utf8')).toBe('');
  });

  it.each(['rollout undo', 'rollout status'])('fails if kubectl %s fails', (call) => {
    const { directory, logPath } = createKubectl();
    const result = runRollback(directory, logPath, ['soroban', 'soroban-api'], call);

    expect(result.status).toBe(19);
    expect(result.stdout).not.toContain('Rollback completed successfully.');
    if (call === 'rollout undo') {
      expect(readFileSync(logPath, 'utf8')).not.toContain('rollout status');
    }
  });
});
