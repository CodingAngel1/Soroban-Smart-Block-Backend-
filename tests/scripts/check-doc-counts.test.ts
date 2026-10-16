import { describe, expect, it } from 'vitest';
import { findStaleCountClaims } from '../../scripts/check-doc-counts';

describe('documentation count drift guard', () => {
  it('rejects stale hard-coded API, test, typecheck, and route counts', () => {
    const readme = [
      'Route handlers (144 files)',
      'npm run test:full runs the suite (215 files)',
      'currently 1012 pre-existing errors',
      '[140+ more endpoints]',
    ].join('\n');
    const tracker = '| Mounted routers | 123 |';
    expect(findStaleCountClaims(readme, tracker)).toHaveLength(5);
  });

  it('accepts command pointers instead of duplicated numbers', () => {
    const readme =
      'npm run validate-routes; npm run validate-routes:ci; npm run test:guard; ' +
      'npm run typecheck:budget:ci; npm run lint:budget:ci.';
    const tracker = 'Use npm run validate-routes and npm run validate-routes:ci.';
    expect(findStaleCountClaims(readme, tracker)).toEqual([]);
  });
});
