# PostgreSQL pool metrics

The authenticated `/metrics` endpoint includes connection-pool gauges and
acquisition wait-time observations for the Prisma write, read, and backfill
clients, plus the raw-SQL and graph `pg.Pool` clients:

- `prisma_pool_connections_open`, `prisma_pool_connections_busy`, and
  `prisma_pool_connections_idle` report Prisma pool connections. The `pool`
  label is one of `write`, `read`, or `backfill`.
- `prisma_pool_queries_wait` and
  `prisma_pool_queries_wait_duration_ms` report Prisma queue depth and
  cumulative wait time.
- `postgres_pool_connections`, `postgres_pool_waiting_clients`, and
  `postgres_pool_saturation_ratio` report the custom `pg.Pool` clients. The
  `pool` label is `raw` or `graph`.
- `postgres_pool_wait_seconds` and `postgres_pool_wait_errors_total` report
  acquisition latency and failures for custom `pg.Pool` clients.

Prisma's metrics preview feature is enabled at client generation time. No
database migration or rollout ordering change is needed; regenerate the Prisma
client as part of the normal build. These metrics are network-independent and
the existing `/metrics` authentication/network restrictions continue to apply.
