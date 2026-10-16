# Indexer freshness SLO and ledger-lag alerts

The indexer exports `indexer_ledger_close_timestamp_seconds{network}` from the
close time of the last ledger whose cursor was successfully committed.
`indexer:freshness_age_seconds` is the Prometheus recording rule for
`time() - indexer_ledger_close_timestamp_seconds`; it measures indexed-data
freshness rather than process or poll-loop activity. The indexer also exports
`indexer_last_ledger{network}` and `indexer_ingestion_lag_ledgers{network}`.
Ledger lag is refreshed after each successful cursor commit. If the RPC tip
cannot be read, the last known lag is retained rather than being reported as
zero; the RPC warning is logged and RPC metrics continue to report the failure.

| Network |  Freshness warning | Freshness critical |            Lag warning |            Lag critical |
| ------- | -----------------: | -----------------: | ---------------------: | ----------------------: |
| Mainnet |     60 s for 5 min |    300 s for 2 min |   50 ledgers for 5 min |   200 ledgers for 2 min |
| Testnet |     60 s for 5 min |    300 s for 2 min |   50 ledgers for 5 min |   200 ledgers for 2 min |
| Devnet  | 1,800 s for 10 min |  3,600 s for 5 min | 300 ledgers for 10 min | 1,000 ledgers for 5 min |

Mainnet and testnet values are operational starting objectives, not a claim
that every ledger closes at a fixed interval. Devnet is intentionally less
strict because local networks may pause or produce ledgers irregularly. Confirm
that a devnet is producing ledgers before paging on its freshness alerts.
Deployments that disable the indexer (`DISABLE_INDEXER=true`) should exclude
the indexer rules from alert routing or avoid scraping these rules for that
workload.

The labels are bounded to the configured Stellar network; URLs, account
identifiers, and ledger values are not labels. Existing unlabeled consumers
should update their PromQL to group or filter by `network`. No database schema
or public API response changes are required. Alert thresholds are introduced
in Prometheus and should be rolled out after the exporter is deployed so the
new metrics exist; until a successful cursor commit creates a sample, freshness
alerts have no data and do not infer health.
