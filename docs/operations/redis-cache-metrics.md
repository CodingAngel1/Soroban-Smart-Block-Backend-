# Redis cache metrics

`/metrics` exports `redis_cache_operations_total{family,operation,outcome}`.
`family` is the bounded cache resource family from the TTL registry (unknown
namespaces are grouped under `default`); `operation` is `get`, `set`, or
`delete`; and `outcome` is `hit`, `miss`, `success`, or `error`. Use `rate()`
over the counter to calculate per-family rates and the `error` share.

Only Redis backend operations are counted. An L1 in-memory hit is not sent to
Redis and is therefore excluded. When Redis is configured but unavailable,
operations that fall back to memory are counted as errors for their family.
Memory-only configurations do not emit Redis-operation samples. No schema,
network, or rollout-order changes are required; existing `/metrics` access
controls still apply.
