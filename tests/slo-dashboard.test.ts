import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface DashboardPanel {
  title: string;
  targets?: Array<{ expr: string }>;
}

const dashboard = JSON.parse(
  readFileSync(resolve(process.cwd(), 'grafana/dashboards/soroban-slo-error-budget.json'), 'utf8'),
) as {
  title: string;
  templating: { list: Array<{ name: string; query: { query: string } }> };
  panels: DashboardPanel[];
};

describe('Soroban SLO Grafana dashboard', () => {
  it('defines the 30-day 99.9% request availability objective and budget calculation', () => {
    const availability = dashboard.panels.find((panel) =>
      panel.title.startsWith('Availability (30d'),
    );
    const budget = dashboard.panels.find((panel) =>
      panel.title.startsWith('Error Budget Remaining'),
    );

    expect(availability?.targets?.[0].expr).toContain('status_code=~"5.."');
    expect(availability?.targets?.[0].expr).toContain('[30d]');
    expect(availability?.targets?.[0].expr).toContain('route!~');
    expect(availability?.targets?.[0].expr).toContain('healthz|readyz|livez|health|metrics');
    expect(budget?.targets?.[0].expr).toContain('/ 0.001');
    expect(budget?.targets?.[0].expr).toContain('clamp_max');
    expect(budget?.targets?.[0].expr).toContain('clamp_min');
  });

  it('includes operational panels and a deployment selector', () => {
    const panels = dashboard.panels.map((panel) => panel.title);
    const jobSelector = dashboard.templating.list.find((variable) => variable.name === 'job');

    expect(dashboard.title).toBe('Soroban Explorer SLO & Error Budget');
    expect(panels).toEqual(
      expect.arrayContaining([
        'Error Budget Burn Rate (1h)',
        'API Request Latency (p95)',
        'Indexer Persistence Lag',
        'Database Status',
        'Cache Backend',
        'Stellar RPC Errors by Operation',
      ]),
    );
    expect(jobSelector?.query.query).toContain('label_values(http_requests_total, job)');
    expect(dashboard.panels.flatMap((panel) => panel.targets ?? []).length).toBeGreaterThanOrEqual(
      8,
    );
  });
});
