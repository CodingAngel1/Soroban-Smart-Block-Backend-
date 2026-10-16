# Catch-up checkpoint consistency

Catch-up progress is network-scoped and can advance only after the sub-range
finishes indexing. The checkpoint commit runs in a database transaction that
checks the expected ledger, transaction, and event rows for that network before
upserting progress. The row checks and checkpoint update therefore succeed or
fail together.

If any indexed row is missing, the checkpoint write fails and catch-up does not
advance the global cursor. If the checkpoint database write itself fails, the
failure is propagated instead of being treated as successful work. Already
persisted indexed rows may be encountered again after restart; indexer upserts
are idempotent, so this is an at-least-once replay rather than a skipped range.

The checkpoint migration assigns existing rows to the network associated with
the most advanced `_indexer_states` singleton (or `mainnet` if none exists).
As with indexed ledger records, confirm this matches the database's historical
profile before deploying. No API or checkpoint payload format changes.
