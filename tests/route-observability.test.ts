import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('API route observability dashboard', () => {
  it('includes per-route REST latency and errors plus GraphQL execution panels', () => {
    const dashboard = JSON.parse(
      readFileSync('grafana/dashboards/api-indexer-overview.json', 'utf8'),
    ) as { panels: Array<{ title: string; targets?: Array<{ expr: string }> }> };
    const panels = dashboard.panels;

    expect(panels.map(({ title }) => title)).toContain('HTTP Route p95 Latency (top 10)');
    expect(panels.map(({ title }) => title)).toContain('HTTP Route 5xx Error Ratio');
    expect(panels.map(({ title }) => title)).toContain('GraphQL Operation p95 Latency');
    expect(panels.map(({ title }) => title)).toContain('GraphQL Operation Error Rate');
    expect(
      panels
        .flatMap(({ targets }) => targets ?? [])
        .some(
          ({ expr }) =>
            expr.includes('http_request_duration_seconds_bucket') && expr.includes('route'),
        ),
    ).toBe(true);
  });
});
