# API Availability and Latency SLOs

This policy measures the public HTTP API by bounded endpoint class. It uses
server-side response status and duration from the existing metrics middleware;
it does not change response payloads or routing behavior.

## Objectives

Each class has a **99.5% availability objective over a rolling 30 days**, with
a 0.5% request error budget (3 hours 36 minutes of equivalent unavailability
at constant traffic). Successful responses are HTTP 2xx or 3xx; server errors
(5xx) consume the budget. Client errors (4xx), including rate limits (429), are
excluded because they do not indicate a service failure.

| Endpoint class | Classification | p95 latency objective |
| --- | --- | ---: |
| `read` | GET/HEAD under `/api/`, except compute and GraphQL routes | ≤ 250 ms |
| `write` | Other HTTP methods under `/api/`, except compute and GraphQL routes | ≤ 500 ms |
| `compute` | `/api/vN/` simulate, verify, compiler, sandbox, account-abstraction, reentrancy, composability, MEV, privacy, fraud, and DEX analyze routes | ≤ 1.5 s |
| `graphql` | `/api/graphql` | ≤ 500 ms |

Class matching is based on the request path and method, with `compute` and
`graphql` taking precedence over `read`/`write`. Non-API routes, including
health probes and `/metrics`, are not included. Classes are intentionally
coarse and bounded; raw paths, identifiers, API keys, and network names are
never added as labels.

## Metrics and queries

The application exports:

- `api_slo_requests_total{endpoint_class,outcome}` with `outcome` set to
  `good`, `bad`, or `excluded`.
- `api_slo_request_duration_seconds{endpoint_class,outcome}` with the same
  bounded labels. Latency objectives use successful (`good`) responses.

The 30-day availability SLI by class is:

```promql
sum by (endpoint_class) (increase(api_slo_requests_total{outcome="good"}[30d]))
/
clamp_min(
  sum by (endpoint_class) (increase(api_slo_requests_total{outcome=~"good|bad"}[30d])),
  1
)
```

The p95 latency query is:

```promql
histogram_quantile(
  0.95,
  sum by (le, endpoint_class) (
    rate(api_slo_request_duration_seconds_bucket{outcome="good"}[30d])
  )
)
```

Prometheus rules in `prometheus/alerts.yml` record one- and six-hour
server-error ratios, alert on 14.4x/6x availability-budget burn, and alert when
the ten-minute p95 exceeds the class target for ten minutes. The existing
global 5xx alert remains as a complementary service-wide signal. Validate rule
syntax with `promtool check rules prometheus/alerts.yml`.

## Operational procedure

1. Configure Prometheus to scrape the authenticated `/metrics` endpoint using
   the deployment's existing metrics credentials/network policy.
2. After rollout, confirm `api_slo_requests_total` and histogram series appear
   for classes receiving traffic. No traffic produces no time series; missing
   telemetry is not a healthy SLO result.
3. During an alert, identify `endpoint_class` and the Prometheus target first.
   Check the corresponding class p95, its 5xx ratio, generic
   `http_request_duration_seconds` route series, application logs, and
   database/RPC/cache health before rolling back or scaling.
4. Review the rolling 30-day SLI and remaining 0.5% error budget at release
   review. If exhausted, pause risky rollouts until the class is back within
   budget and the cause is addressed.

## Compatibility, rollout, and network scope

The metrics are additive and preserve the existing generic HTTP metrics. The
metrics endpoint remains protected and is not made public by this change.
Roll out the application before enabling the new alert rules; alerts have no
series until the new version has handled API traffic.

Each API process serves the network selected by `STELLAR_NETWORK`. For
network-specific SLOs, attach a stable `stellar_network` label to each scrape
target in Prometheus and evaluate each target/network separately. Do not combine
networks when they have different RPC providers, traffic profiles, or
maintenance windows; a combined SLI can hide a degraded network. The
application deliberately does not emit a network label, so deployments that
serve multiple networks in one process would need an explicit policy change.

These are initial operational objectives, not a claim that the service has
already met them. Review the thresholds against production-equivalent traffic
and resources after collecting a representative 30-day window.
