import * as fs from 'fs';
import * as path from 'path';
import * as glob from 'glob';
import vitestConfig from '../vitest.config';
import { validateRoutes } from './validate-routes';

const ROOT = path.join(__dirname, '..');
const NON_BLOCKING_RULES = new Set([
  '@typescript-eslint/no-explicit-any',
  '@typescript-eslint/no-non-null-assertion',
  'error-handling/no-phantom-prisma-field',
]);

interface LintBaseline {
  warnings: Record<string, Record<string, number>>;
}

export function findStaleCountClaims(readme: string, tracker: string): string[] {
  const checks: Array<{ document: string; content: string; pattern: RegExp; label: string }> = [
    {
      document: 'README.md',
      content: readme,
      pattern: /Route handlers\s*\(\s*\d+\s+(?:files|endpoints)\s*\)/i,
      label: 'API file count',
    },
    {
      document: 'README.md',
      content: readme,
      pattern: /test:full.{0,100}\(\s*\d+\s+files?\s*\)/i,
      label: 'Vitest file count',
    },
    {
      document: 'README.md',
      content: readme,
      pattern: /currently\s+\d+\s+pre-existing\s+errors/i,
      label: 'TypeScript error count',
    },
    {
      document: 'README.md',
      content: readme,
      pattern: /\[\d+\+\s+more\s+(?:endpoints|modules|middleware|services|files)\]/i,
      label: 'Hand-maintained directory count',
    },
    {
      document: 'docs/orphaned-routes-tracking.md',
      content: tracker,
      pattern: /\|\s*(?:Mounted routers|Pending-schema.*|Orphaned routers|Exact route conflicts|CI budget)\s*\|\s*\d+/i,
      label: 'Hand-maintained route count',
    },
  ];
  return checks
    .filter(({ content, pattern }) => pattern.test(content))
    .map(({ document, label }) => `${document} contains a stale-prone ${label}; use its source command.`);
}

function collectTestFiles(): string[] {
  const config = vitestConfig.test ?? {};
  const include = (config.include as string[] | undefined) ?? [];
  const exclude = (config.exclude as string[] | undefined) ?? [];
  const files = new Set<string>();
  for (const pattern of include) {
    for (const file of glob.sync(pattern, { cwd: ROOT, ignore: exclude, nodir: true })) {
      files.add(file);
    }
  }
  return [...files];
}

function readPackageJson(): { scripts: Record<string, string> } {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8')) as {
    scripts: Record<string, string>;
  };
}

function main(): void {
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf-8');
  const tracker = fs.readFileSync(path.join(ROOT, 'docs/orphaned-routes-tracking.md'), 'utf-8');
  const issues = findStaleCountClaims(readme, tracker);
  const pointers: Array<[string, RegExp]> = [
    ['npm run validate-routes', /npm run validate-routes/],
    ['npm run validate-routes:ci', /npm run validate-routes:ci/],
    ['npm run test:guard', /npm run test:guard/],
    ['npm run typecheck:budget:ci', /npm run typecheck:budget:ci/],
    ['npm run lint:budget:ci', /npm run lint:budget:ci/],
  ];
  for (const [command, expression] of pointers) {
    if (!expression.test(readme)) issues.push(`README.md must point to ${command} for live counts.`);
  }
  if (!/npm run validate-routes/.test(tracker) || !/npm run validate-routes:ci/.test(tracker)) {
    issues.push('docs/orphaned-routes-tracking.md must point to both route validator commands.');
  }

  const packageJson = readPackageJson();
  const typecheckBaseline = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'typecheck-error-baseline.json'), 'utf-8'),
  ) as Record<string, number>;
  const typecheckCount = Object.values(typecheckBaseline).reduce((sum, value) => sum + value, 0);
  const typecheckBudget = packageJson.scripts['typecheck:budget:ci'].match(/--max-errors\s+(\d+)/);
  if (!typecheckBudget || Number(typecheckBudget[1]) !== typecheckCount) {
    issues.push('The typecheck package budget must match scripts/typecheck-error-baseline.json.');
  }

  const lintBaseline = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'lint-debt-baseline.json'), 'utf-8'),
  ) as LintBaseline;
  const nonBlockingCount = Object.values(lintBaseline.warnings).reduce(
    (sum, rules) =>
      sum +
      Object.entries(rules).reduce(
        (ruleSum, [rule, count]) => ruleSum + (NON_BLOCKING_RULES.has(rule) ? count : 0),
        0,
      ),
    0,
  );
  const lintBudget = packageJson.scripts['lint:budget:ci'].match(/--max-non-blocking\s+(\d+)/);
  if (!lintBudget || Number(lintBudget[1]) !== nonBlockingCount) {
    issues.push('The non-blocking lint budget must match scripts/lint-debt-baseline.json.');
  }

  if (issues.length > 0) {
    console.error('Documentation count check failed:');
    for (const issue of issues) console.error(`- ${issue}`);
    process.exit(1);
  }

  const routeStatus = validateRoutes(Number.MAX_SAFE_INTEGER);
  console.log(
    `Documentation count check passed. Live counts: ${glob.sync('src/api/**/*.ts').length} API TypeScript modules, ` +
      `${collectTestFiles().length} Vitest files, ${typecheckCount} TypeScript baseline errors, ` +
      `${routeStatus.mountedRouters.length} mounted routers, ${routeStatus.pendingSchemaRouters.length} pending-schema routers, ` +
      `${routeStatus.orphanedRouters.length} orphans, ${routeStatus.routeConflicts.length} route conflicts.`,
  );
}

if (require.main === module) main();
