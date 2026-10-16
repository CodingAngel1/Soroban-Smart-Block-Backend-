ALTER TABLE "_catch_up_checkpoints"
ADD COLUMN "network" TEXT NOT NULL DEFAULT 'mainnet';

DROP INDEX "_catch_up_checkpoints_range_start_range_end_key";

CREATE UNIQUE INDEX "_catch_up_checkpoints_network_range_start_range_end_key"
ON "_catch_up_checkpoints"("network", "range_start", "range_end");
