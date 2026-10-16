import { createNetworkClient, fetchRecentActivity } from './client';

async function main(): Promise<void> {
  const client = createNetworkClient('mainnet');
  process.stdout.write(`${JSON.stringify(await fetchRecentActivity(client), null, 2)}\n`);
}

main().catch((error: unknown) => {
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`Mainnet API example failed: ${detail}\n`);
  process.exitCode = 1;
});
