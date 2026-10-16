import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = path.resolve(__dirname, '../..');
const dockerfile = readFileSync(path.join(repositoryRoot, 'Dockerfile'), 'utf8');
const deploymentFiles = [
  'k8s/api-deployment.yaml',
  'k8s/multi-network-deployment.yaml',
].map((file) => readFileSync(path.join(repositoryRoot, file), 'utf8'));

describe('runtime container privilege configuration', () => {
  it('builds the application image with the dedicated non-root user', () => {
    expect(dockerfile).toMatch(/adduser --uid 1001 --gid 1001/);
    expect(dockerfile).toMatch(/\nUSER appuser\n/);
  });

  it.each(deploymentFiles.map((content, index) => [index, content] as const))(
    'restricts Kubernetes deployment %s',
    (_index, manifest) => {
      expect(manifest).toContain('runAsNonRoot: true');
      expect(manifest).toContain('runAsUser: 1001');
      expect(manifest).toContain('allowPrivilegeEscalation: false');
      expect(manifest).toMatch(/capabilities:\s+drop:\s+- ALL/);
      expect(manifest).toMatch(/seccompProfile:\s+type: RuntimeDefault/);
    },
  );
});
