# Event-total reconciliation

The daily reconciliation sweep compares local event counts grouped by ledger
with events returned by the Soroban RPC for the overlapping recent ledger range.
The report includes local/upstream totals, the checked range, and each ledger
whose counts differ. Event-total differences make the report unhealthy and are
included in the configured alert; they do not automatically trigger a repair,
because a count mismatch alone does not identify which event records need
rebuilding.

The lookback is controlled by the `runReconciliation(lookbackLedgers)` argument
(default: 1,000). The comparison ends at the lower of the local and Horizon
ledger tips, avoiding comparisons against a ledger that has not yet been
closed/indexed. Failed or incomplete RPC pagination is reported as a failed
reconciliation check, not as a zero-event result.

Run each indexer against a database and `STELLAR_NETWORK` profile for the same
network. Testnet, mainnet, and devnet have independent event histories and
RPC/Horizon endpoints; counts from one network must not be compared against
another network's database.
