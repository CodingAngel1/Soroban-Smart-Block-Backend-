# Network-scoped indexed records

Ledger, transaction, and event rows are identified within a Stellar network.
The indexer writes the active profile's network into each row; ledger sequence
and transaction hash constraints, plus ledger/transaction foreign keys, are
scoped by that network. This permits identical ledger sequences and transaction
hashes in separate networks without cross-linking their records.

## Migration and rollout

Apply the migration before deploying the updated indexer. It assigns existing
ledger, transaction, and event rows to the network attached to the
`_indexer_states` singleton with the highest checkpoint (falling back to
`mainnet` if no checkpoint exists). It removes the temporary column defaults
after migration so new indexed rows must supply their network explicitly.
The existing indexed tables previously represented only one network because
ledger sequence and transaction hash were globally unique. Confirm that this
assumption matches the database before rollout:

```sql
SELECT network, last_ledger
FROM "_indexer_states"
WHERE id = 'singleton'
ORDER BY last_ledger DESC;
```

If a database has been manually populated from multiple networks, reconcile
those records before applying this migration; their original network cannot be
reliably inferred from ledger rows alone. Validate that existing event and
transaction rows reference ledgers on the selected network before the new
composite foreign keys are installed. Separate profile databases and their
network-specific configuration remain unchanged. This migration scopes the
indexed ledger, transaction, event, and signature-inspection records; it does
not combine the rest of the network profile data into one database.
