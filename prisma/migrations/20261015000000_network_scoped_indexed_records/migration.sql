BEGIN;

ALTER TABLE "_transactions" DROP CONSTRAINT "_transactions_ledger_sequence_fkey";
ALTER TABLE "_events" DROP CONSTRAINT "_events_ledger_sequence_fkey";
ALTER TABLE "_events" DROP CONSTRAINT "_events_transaction_hash_fkey";
ALTER TABLE "_signature_inspections"
  DROP CONSTRAINT "_signature_inspections_transaction_hash_fkey";
ALTER TABLE "_ledgers" DROP CONSTRAINT "_ledgers_pkey";

ALTER TABLE "_ledgers"
  ADD COLUMN "network" VARCHAR(16) NOT NULL DEFAULT 'mainnet';
ALTER TABLE "_transactions"
  ADD COLUMN "network" VARCHAR(16) NOT NULL DEFAULT 'mainnet';
ALTER TABLE "_events"
  ADD COLUMN "network" VARCHAR(16) NOT NULL DEFAULT 'mainnet';
ALTER TABLE "_signature_inspections"
  ADD COLUMN "network" VARCHAR(16) NOT NULL DEFAULT 'mainnet';

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

  UPDATE "_ledgers" SET "network" = indexed_network;
  UPDATE "_transactions" SET "network" = indexed_network;
  UPDATE "_events" SET "network" = indexed_network;
  UPDATE "_signature_inspections" SET "network" = indexed_network;

  EXECUTE format('ALTER TABLE "_ledgers" ALTER COLUMN "network" SET DEFAULT %L', indexed_network);
  EXECUTE format('ALTER TABLE "_transactions" ALTER COLUMN "network" SET DEFAULT %L', indexed_network);
  EXECUTE format('ALTER TABLE "_events" ALTER COLUMN "network" SET DEFAULT %L', indexed_network);
  EXECUTE format('ALTER TABLE "_signature_inspections" ALTER COLUMN "network" SET DEFAULT %L', indexed_network);
END $$;

DROP INDEX "_ledgers_hash_key";
DROP INDEX "_transactions_hash_key";
DROP INDEX "_signature_inspections_transaction_hash_key";

ALTER TABLE "_ledgers"
  ADD CONSTRAINT "_ledgers_pkey" PRIMARY KEY ("network", "sequence");

CREATE UNIQUE INDEX "_ledgers_network_hash_key" ON "_ledgers"("network", "hash");
CREATE INDEX "_ledgers_network_close_time_idx" ON "_ledgers"("network", "close_time");
CREATE UNIQUE INDEX "_transactions_network_hash_key" ON "_transactions"("network", "hash");
CREATE INDEX "_transactions_network_ledger_sequence_idx"
  ON "_transactions"("network", "ledger_sequence");
CREATE INDEX "_events_network_transaction_hash_idx" ON "_events"("network", "transaction_hash");
CREATE INDEX "_events_network_ledger_sequence_idx" ON "_events"("network", "ledger_sequence");
CREATE UNIQUE INDEX "_signature_inspections_network_transaction_hash_key"
  ON "_signature_inspections"("network", "transaction_hash");

ALTER TABLE "_transactions"
  ADD CONSTRAINT "_transactions_network_ledger_sequence_fkey"
  FOREIGN KEY ("network", "ledger_sequence")
  REFERENCES "_ledgers"("network", "sequence")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "_events"
  ADD CONSTRAINT "_events_network_ledger_sequence_fkey"
  FOREIGN KEY ("network", "ledger_sequence")
  REFERENCES "_ledgers"("network", "sequence")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "_events"
  ADD CONSTRAINT "_events_network_transaction_hash_fkey"
  FOREIGN KEY ("network", "transaction_hash")
  REFERENCES "_transactions"("network", "hash")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "_signature_inspections"
  ADD CONSTRAINT "_signature_inspections_network_transaction_hash_fkey"
  FOREIGN KEY ("network", "transaction_hash")
  REFERENCES "_transactions"("network", "hash")
  ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
