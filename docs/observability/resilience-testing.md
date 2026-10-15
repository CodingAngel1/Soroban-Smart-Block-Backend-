# Dependency outage behavior and verification

This backend handles partial dependency failures independently; it does not
switch Stellar networks or silently treat failed database writes as successful.

## Failure behavior

| Dependency | Degraded behavior | Health signal |
| --- | --- | --- |
| PostgreSQL read client | A failed read probe is reported as `degraded` when the write primary is reachable. A failed write-primary probe is `unhealthy`; the health response records each client separately. | Detailed `/health` response |
| Redis | Cache values are retained in the local in-memory cache. A failed Redis command marks the Redis backend unavailable, and cache operations continue against memory. Redis-backed state is not shared across replicas or durable across restarts. | `cache_backend_status=0`, `/health`, and `CacheBackendFallback` alerts |
| Stellar RPC / Horizon | Ledger metadata is fetched from Horizon first and falls back to RPC. A failure from both sources is propagated so the indexer does not advance its cursor. Network-specific RPC and Horizon URLs are configured by `STELLAR_NETWORK`. | RPC/Horizon error metrics, `/health`, and indexer lag alerts |

Redis reconnection restores the Redis health gauge when the client emits its
`ready` event. Cache entries written during an outage remain local and are not
backfilled to Redis; normal cache misses repopulate Redis after recovery.
Operators should expect increased database load and per-replica cache
inconsistency while Redis is unavailable.

## Focused checks

Run the dependency failure tests without external PostgreSQL, Redis, or Stellar
services:

```sh
TESTNET_DATABASE_URL=postgresql://test:test@localhost:5432/test \
STELLAR_NETWORK=testnet CACHE_URL=memory:// \
npm test -- tests/health-readiness.test.ts src/__tests__/cacheFallback.test.ts tests/indexer/rpc.test.ts
```

No schema change or data migration is required. For each deployment network,
verify the configured Horizon endpoint and Soroban RPC endpoint refer to the
same Stellar network; failover is within that network only.
