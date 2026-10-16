import { prismaBackfill, prismaRead, prismaWrite } from '../db';

interface PrismaMetricsClient {
  $metrics: {
    prometheus(options: { globalLabels: Record<string, string> }): Promise<string>;
  };
}

const poolMetricSources = [
  { pool: 'write', client: prismaWrite },
  { pool: 'read', client: prismaRead },
  { pool: 'backfill', client: prismaBackfill },
] as const;

export function combinePrometheusExpositions(expositions: string[]): string {
  const declaredMetrics = new Set<string>();
  const lines = expositions.flatMap((exposition) =>
    exposition
      .trim()
      .split(/\r?\n/)
      .filter((line) => {
        const declaration = line.match(/^# (HELP|TYPE) ([^\s]+)/);
        if (!declaration) return line.length > 0;
        const key = `${declaration[1]}:${declaration[2]}`;
        if (declaredMetrics.has(key)) return false;
        declaredMetrics.add(key);
        return true;
      }),
  );
  return lines.length > 0 ? `${lines.join('\n')}\n` : '';
}

export async function getPrismaPoolMetrics(): Promise<string> {
  const expositions = await Promise.all(
    poolMetricSources.map(({ pool, client }) => {
      const metricsClient = (client as typeof client & PrismaMetricsClient).$metrics;
      return metricsClient.prometheus({ globalLabels: { pool } });
    }),
  );
  return combinePrometheusExpositions(expositions);
}
