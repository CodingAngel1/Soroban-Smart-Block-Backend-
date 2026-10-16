import { config } from '../config';
import { prismaWrite } from '../db';

export interface IndexerPauseState {
  network: string;
  paused: boolean;
}

const activeNetwork = (): string => process.env.STELLAR_NETWORK ?? 'mainnet';

export async function getIndexerPauseState(): Promise<IndexerPauseState> {
  const network = activeNetwork();
  const rows = await prismaWrite.$queryRaw<Array<{ paused: boolean }>>`
    SELECT "paused"
    FROM "_indexer_states"
    WHERE "id" = 'singleton' AND "network" = ${network}
    LIMIT 1
  `;
  return { network, paused: rows[0]?.paused ?? false };
}

export async function setIndexerPaused(paused: boolean): Promise<IndexerPauseState> {
  const network = activeNetwork();
  const rows = await prismaWrite.$queryRaw<Array<{ paused: boolean }>>`
    INSERT INTO "_indexer_states"
      ("id", "network", "last_ledger", "paused", "updated_at")
    VALUES
      ('singleton', ${network}, ${config.indexerStartLedger}, ${paused}, NOW())
    ON CONFLICT ("id")
    DO UPDATE SET
      "paused" = EXCLUDED."paused",
      "updated_at" = NOW()
    WHERE "_indexer_states"."network" = EXCLUDED."network"
    RETURNING "paused"
  `;
  if (!rows.length) {
    throw new Error(`Indexer state row belongs to a different network than ${network}`);
  }
  return { network, paused: rows[0].paused };
}
