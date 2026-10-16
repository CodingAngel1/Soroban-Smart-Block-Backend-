import { describe, expect, it } from 'vitest';
import { countFromJson, findLintDebtIncreases } from '../../scripts/lint-budget';

describe('lint debt ratchet', () => {
  it('counts errors and warnings by repository-relative file and rule', () => {
    const filePath = `${process.cwd()}/src/api/example.ts`;
    const result = countFromJson(
      [
        {
          filePath,
          messages: [
            { severity: 1, ruleId: '@typescript-eslint/no-explicit-any' },
            { severity: 1, ruleId: 'no-console' },
            { severity: 2, ruleId: '@typescript-eslint/no-non-null-assertion' },
          ],
        },
      ],
      '',
      false,
    );
    expect(result.totalWarnings).toBe(2);
    expect(result.blockingWarnings).toBe(1);
    expect(result.warningsByFile['src/api/example.ts']).toEqual({
      '@typescript-eslint/no-explicit-any': 1,
      'no-console': 1,
    });
    expect(result.errorsByFile['src/api/example.ts']).toEqual({
      '@typescript-eslint/no-non-null-assertion': 1,
    });
  });

  it('fails when non-blocking debt increases in one file despite decreases elsewhere', () => {
    expect(
      findLintDebtIncreases(
        {
          'src/api/a.ts': { '@typescript-eslint/no-explicit-any': 4 },
          'src/api/b.ts': { '@typescript-eslint/no-explicit-any': 1 },
        },
        {
          'src/api/a.ts': { '@typescript-eslint/no-explicit-any': 3 },
          'src/api/b.ts': { '@typescript-eslint/no-explicit-any': 3 },
        },
      ),
    ).toEqual([
      {
        file: 'src/api/a.ts',
        rule: '@typescript-eslint/no-explicit-any',
        current: 4,
        baseline: 3,
      },
    ]);
  });

  it('allows a per-file debt reduction without increasing the baseline', () => {
    expect(
      findLintDebtIncreases(
        { 'src/api/a.ts': { '@typescript-eslint/no-explicit-any': 2 } },
        { 'src/api/a.ts': { '@typescript-eslint/no-explicit-any': 3 } },
      ),
    ).toEqual([]);
  });

  it('sets selected source rules to errors and legacy exceptions to warnings', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const config = require('../../.eslintrc.js') as {
      overrides: Array<{ files: string[]; rules: Record<string, string> }>;
    };
    const sourceRules = config.overrides.find((override) =>
      override.files.includes('src/**/*.ts'),
    )?.rules;
    const exceptionRules = config.overrides.find((override) =>
      override.files.includes('src/api/agents.ts'),
    )?.rules;

    expect(sourceRules?.['@typescript-eslint/no-explicit-any']).toBe('error');
    expect(sourceRules?.['@typescript-eslint/no-non-null-assertion']).toBe('error');
    expect(sourceRules?.['no-console']).toBe('error');
    expect(exceptionRules?.['@typescript-eslint/no-explicit-any']).toBe('warn');
  });
});
