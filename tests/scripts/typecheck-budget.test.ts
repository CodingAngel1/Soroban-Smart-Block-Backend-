import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  TYPE_ERROR_BUDGET,
  findIncreasedFiles,
  parseTypeErrors,
} from '../../scripts/typecheck-budget';

describe('Typecheck budget reconciliation (#1113)', () => {
  it('counts compiler errors by source file', () => {
    const parsed = parseTypeErrors(
      [
        'src/api/gas.ts(3,4): error TS2322: Type mismatch.',
        'src/api/gas.ts(5,6): error TS2345: Wrong argument.',
        'src/lib/cache.ts(8,9): error TS7006: Missing type.',
      ].join('\n'),
    );
    expect(parsed.count).toBe(3);
    expect(parsed.byFile).toEqual({ 'src/api/gas.ts': 2, 'src/lib/cache.ts': 1 });
  });

  it('flags increases per file even when total errors could remain flat', () => {
    expect(
      findIncreasedFiles(
        { 'src/api/gas.ts': 3, 'src/lib/cache.ts': 1 },
        { 'src/api/gas.ts': 2, 'src/lib/cache.ts': 2 },
      ),
    ).toEqual([{ file: 'src/api/gas.ts', current: 3, baseline: 2 }]);
  });

  it('defaults new files to a zero-error baseline', () => {
    expect(findIncreasedFiles({ 'src/api/new-route.ts': 1 }, {})).toEqual([
      { file: 'src/api/new-route.ts', current: 1, baseline: 0 },
    ]);
  });

  it('keeps the total budget aligned with the checked-in baseline', () => {
    expect(TYPE_ERROR_BUDGET).toBe(1312);
    const baselinePath = path.resolve(__dirname, '../../scripts/typecheck-error-baseline.json');
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf-8')) as Record<string, number>;
    expect(Object.values(baseline).reduce((sum, count) => sum + count, 0)).toBe(TYPE_ERROR_BUDGET);
  });

  it('asserts package.json enforces TYPE_ERROR_BUDGET', () => {
    const pkgPath = path.resolve(__dirname, '../../package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    expect(pkg.scripts['typecheck:budget']).toContain(`--max-errors ${TYPE_ERROR_BUDGET}`);
    expect(pkg.scripts['typecheck:budget:ci']).toContain(`--max-errors ${TYPE_ERROR_BUDGET}`);
  });

  it('runs the per-file typecheck budget in CI', () => {
    const ciPath = path.resolve(__dirname, '../../.github/workflows/ci.yml');
    const ciContent = fs.readFileSync(ciPath, 'utf-8');
    expect(ciContent).toContain('run: npm run typecheck:budget:ci');
  });
});
