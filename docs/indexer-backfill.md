# Resumable indexer catch-up

Large indexer catch-ups are split into fixed 100-ledger windows. Progress is
stored after each successfully processed batch in `_catch_up_checkpoints`,
keyed by network and the fixed window boundaries. A restart resumes after the
last committed batch; a fully completed window is skipped. Checkpoint reads
and writes are required for catch-up to proceed, so a database error leaves the
global indexer cursor unchanged.

Ledger, transaction, and event persistence use upserts with stable identifiers.
If a process stops after writing a batch but before saving its checkpoint, that
batch is replayed on restart without creating duplicate database rows.

## Rollout and compatibility

Apply the new Prisma migration before deploying the updated indexer:

```sh
npm run prisma:deploy
```

Existing checkpoint rows are assigned to `mainnet` by the migration default.
If an older deployment used a shared database for another network, its
incomplete checkpoints will not be reused under that network key; those ledgers
will be safely replayed using idempotent upserts. Deploy the schema migration
before starting an indexer on the new release.
