# Soroban backend SLO and error budget

The Grafana dashboard at
`grafana/dashboards/soroban-slo-error-budget.json` tracks a **99.9% request
availability objective over a rolling 30-day window**. An unsuccessful request
is an HTTP 5xx; client-side 4xx responses are excluded. Operational `/health`,
`/healthz`, `/readyz`, `/livez`, and `/metrics` routes are not eligible requests
and are excluded from the SLI. The resulting request error budget is 0.1% of
eligible requests. Remaining budget is clamped between 0% and 100%, and the
burn-rate panel compares the current 1-hour error ratio with that 0.1%
allowance.

The dashboard also shows API p95 latency, RPC errors by operation, indexer
persist-stage lag and throughput, the primary database connection gauge, and
Redis-versus-memory cache status. It uses existing Prometheus metrics; no
application dependency, schema, or endpoint changes are required.

## Import and use

1. Import the dashboard JSON in Grafana and select the Prometheus datasource.
2. Select the Prometheus `job`/deployment variable for the API instance group
   being reviewed. The default `All` selection aggregates every matching job.
3. Review availability and budget remaining over the 30-day default time
   range, then use the burn rate and component panels to investigate changes.

The request-based SLO requires at least 30 days of retained
`http_requests_total` samples. With shorter Prometheus retention, the 30-day
panels are incomplete and should not be treated as a complete budget period.
The SLI is request-weighted, not a direct measure of elapsed downtime.

Metrics do not currently carry a Stellar network label. To keep testnet,
mainnet, and devnet budgets independent, scrape each network under a distinct
Prometheus `job` label and choose that job in the dashboard. If multiple
networks are scraped under the same job, the dashboard intentionally
aggregates their request counts and indexer metrics.

Deploying the dashboard is additive and safe alongside existing dashboards.
There is no data migration or service restart; importing only requires the
existing authenticated Prometheus metrics endpoint to be scraped.
