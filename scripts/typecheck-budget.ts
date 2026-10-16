/**
 * TypeScript error budget — ratchet enforcement for `tsc --noEmit`.
 *
 * Resolves #896: CI's Lint job used to run `npm run build:strict || echo
 * 'Type errors found (pre-existing)'`, so a genuinely new type error never
 * failed the build — it was indistinguishable from the pre-existing ones.
 * This script counts the *current* number of `tsc --noEmit` errors and fails
 * only when that count exceeds a checked-in budget, so CI still catches any
 * newly introduced type error (which pushes the count above budget) while
 * the large pre-existing backlog is paid down incrementally rather than
 * fixed in one PR. Lower the budget as errors are fixed; the target is 0.
 * Mirrors the `--max-orphans` pattern in scripts/validate-routes.ts.
 *
 * Usage:
 *   npx ts-node scripts/typecheck-budget.ts                   # strict (budget 0)
 *   npx ts-node scripts/typecheck-budget.ts --max-errors 1374
 *   npm run typecheck:budget                                  # strict
 *   npm run typecheck:budget:ci                                # CI budget
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const FILE_ERROR_RE = /^(.+?)\(\d+,\d+\): error TS\d+:/gm;
const BASELINE_PATH = path.join(__dirname, 'typecheck-error-baseline.json');

interface TypeCheckResult {
  count: number;
  byFile: Record<string, number>;
  output: string;
  failed: boolean;
}

export type TypeErrorBaseline = Record<string, number>;

/** Counts compiler diagnostics by source file, preserving tsc's relative paths. */
export function parseTypeErrors(output: string): TypeCheckResult {
  const byFile: Record<string, number> = {};
  for (const match of output.matchAll(FILE_ERROR_RE)) {
    const file = match[1];
    byFile[file] = (byFile[file] ?? 0) + 1;
  }
  return {
    count: Object.values(byFile).reduce((sum, n) => sum + n, 0),
    byFile,
    output,
    failed: false,
  };
}

/** Runs `tsc --noEmit` against the main project config and counts errors. */
function countTypeErrors(): TypeCheckResult {
  const result = spawnSync('npx', ['tsc', '-p', 'tsconfig.json', '--noEmit'], {
    encoding: 'utf-8',
    maxBuffer: 1024 * 1024 * 64,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const parsed = parseTypeErrors(output);
  return {
    ...parsed,
    failed: result.error !== undefined || (result.status !== 0 && parsed.count === 0),
  };
}

export const TYPE_ERROR_BUDGET = 1312;

export function readTypeErrorBaseline(): TypeErrorBaseline {
  const raw: unknown = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf-8'));
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`Invalid TypeScript error baseline at ${BASELINE_PATH}`);
  }
  const baseline: TypeErrorBaseline = {};
  for (const [file, count] of Object.entries(raw)) {
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
      throw new Error(`Invalid TypeScript error count for ${file} in ${BASELINE_PATH}`);
    }
    baseline[file] = count;
  }
  return baseline;
}

export function findIncreasedFiles(
  current: Record<string, number>,
  baseline: TypeErrorBaseline,
): Array<{ file: string; current: number; baseline: number }> {
  return Object.entries(current)
    .filter(([file, count]) => count > (baseline[file] ?? 0))
    .map(([file, count]) => ({ file, current: count, baseline: baseline[file] ?? 0 }))
    .sort((a, b) => a.file.localeCompare(b.file));
}

function parseMaxErrors(argv: string[]): number {
  const budgetIndex = argv.indexOf('--max-errors');
  if (budgetIndex === -1) return TYPE_ERROR_BUDGET;
  const raw = argv[budgetIndex + 1];
  const parsed = raw !== undefined ? parseInt(raw, 10) : NaN;
  if (Number.isNaN(parsed) || parsed < 0) {
    console.error(`Invalid --max-errors value: "${String(raw)}" (expected a non-negative integer)`);
    process.exit(2);
  }
  return parsed;
}

if (require.main === module) {
  const maxErrors = parseMaxErrors(process.argv.slice(2));

  console.log('Running `tsc --noEmit`  (this may take a minute)...\n');
  const { count, byFile, output, failed } = countTypeErrors();
  let baseline: TypeErrorBaseline;
  try {
    baseline = readTypeErrorBaseline();
  } catch (error) {
    console.error(`❌ TYPE-CHECK FAILED — ${String(error)}\n`);
    process.exit(1);
  }

  if (count > 0) {
    console.log(output);
  }

  console.log('Per-file error counts:');
  for (const [file, errors] of Object.entries(byFile).sort(
    ([fileA, countA], [fileB, countB]) => countB - countA || fileA.localeCompare(fileB),
  )) {
    console.log(`  ${file}: ${errors}`);
  }

  const increasedFiles = findIncreasedFiles(byFile, baseline);
  console.log('───────────────────────────────────────────────────');
  if (failed || increasedFiles.length > 0 || count > maxErrors) {
    if (increasedFiles.length > 0) {
      console.error('Files with increased TypeScript error counts:');
      for (const item of increasedFiles) {
        console.error(`  ${item.file}: ${item.current} (baseline ${item.baseline})`);
      }
    }
    console.log(
      `❌ TYPE-CHECK FAILED — ${count} error(s), total budget ${maxErrors}, ` +
        `${increasedFiles.length} file(s) above their baseline. Fix the regression(s), or run ` +
        `'npm run build:strict' locally to see the full list without truncation.\n`,
    );
    process.exit(1);
  }

  if (count > 0) {
    console.log(
      `✅ TYPE-CHECK PASSED — ${count} pre-existing error(s), within budget of ${maxErrors}. ` +
        `Consider fixing some and lowering the budget in package.json ('typecheck:budget:ci').\n`,
    );
  } else {
    console.log('✅ TYPE-CHECK PASSED — no type errors\n');
  }
  process.exit(0);
}

export { countTypeErrors };
