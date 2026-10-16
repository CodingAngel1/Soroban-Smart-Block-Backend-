import { SorobanClient, type SorobanClientOptions } from '@soroban-explorer/client';

export type StellarNetwork = 'mainnet' | 'testnet';

export function createNetworkClient(
  network: StellarNetwork,
  env: NodeJS.ProcessEnv = process.env,
  fetcher?: SorobanClientOptions['fetch'],
): SorobanClient {
  const variable = `SOROBAN_${network.toUpperCase()}_API_URL`;
  const baseUrl = env[variable]?.trim();
  if (!baseUrl) {
    throw new Error(`${variable} must be set to the ${network} Explorer API base URL`);
  }

  return new SorobanClient({
    baseUrl,
    apiKey: env.SOROBAN_API_KEY,
    fetch: fetcher,
  });
}

export async function fetchRecentActivity(client: SorobanClient) {
  const [transactions, events] = await Promise.all([
    client.transactions.list({ limit: 5 }),
    client.events.list({ limit: 5 }),
  ]);
  return { transactions, events };
}
