# Per-network indexer observability

The Prometheus metrics endpoint reports indexer progress and failure counters by the configured Stellar network:

| Metric                               | Labels              | Meaning                                                                             |
| ------------------------------------ | ------------------- | ----------------------------------------------------------------------------------- |
| `indexer_last_ledger`                | `network`           | Last committed indexer cursor observed for the network                              |
| `indexer_ingestion_lag_ledgers`      | `network`           | Difference between the observed RPC chain tip and committed cursor (never negative) |
| `indexer_pipeline_stage_lag_ledgers` | `network`, `stage`  | Ledger distance for fetch, decode, persist, and enrich stages                       |
| `indexer_error_retries_total`        | `network`, `type`   | Re-enqueued failures by item type                                                   |
| `indexer_error_dlq_total`            | `network`, `reason` | Permanent failures by bounded reason                                                |
| `indexer_error_queue_depth`          | `network`, `queue`  | Pending and dead-letter queue sizes in the configured network's database            |

`network` is read from the validated `STELLAR_NETWORK` profile (`mainnet`, `testnet`, or `devnet`). The existing deployment profiles use separate database clusters, so error-queue counts and retries are scoped by the selected database; do not share one error queue database between network profiles without adding durable network identity and filtering. The label set on retry/dead-letter metrics has changed, so update dashboards and alert expressions that queried the previous unlabeled series. Check each network's `/metrics` scrape independently.
