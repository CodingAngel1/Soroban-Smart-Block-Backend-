BEGIN;

DROP INDEX "_catch_up_checkpoints_range_start_range_end_key";

ALTER TABLE "_catch_up_checkpoints"
  ADD COLUMN "network" VARCHAR(16) NOT NULL DEFAULT 'mainnet';
ALTER TABLE "_ledgers" ALTER COLUMN "network" DROP DEFAULT;
ALTER TABLE "_transactions" ALTER COLUMN "network" DROP DEFAULT;
ALTER TABLE "_events" ALTER COLUMN "network" DROP DEFAULT;
ALTER TABLE "_signature_inspections" ALTER COLUMN "network" DROP DEFAULT;

DO $$
DECLARE
  indexed_network TEXT;
BEGIN
  SELECT "network"
    INTO indexed_network
    FROM "_indexer_states"
   WHERE "id" = 'singleton'
   ORDER BY "last_ledger" DESC, "updated_at" DESC
   LIMIT 1;

  indexed_network := COALESCE(indexed_network, 'mainnet');
  UPDATE "_catch_up_checkpoints" SET "network" = indexed_network;
END $$;

ALTER TABLE "_catch_up_checkpoints" ALTER COLUMN "network" DROP DEFAULT;

CREATE UNIQUE INDEX "_catch_up_checkpoints_network_range_start_range_end_key"
  ON "_catch_up_checkpoints"("network", "range_start", "range_end");

COMMIT;
