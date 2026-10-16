# REST and GraphQL route observability

The `api-indexer-overview` Grafana dashboard adds top-ten HTTP route p95
latency and per-route 5xx ratios, alongside GraphQL operation p95 latency and
execution error rate. HTTP series use `http_request_duration_seconds` and
`http_requests_total`; GraphQL execution series use
`graphql_operation_duration_seconds` and `graphql_operation_errors_total`.

The existing HTTP middleware records the normalized request path, method, and
status code for REST and `/api/graphql`. It collapses UUIDs, numeric IDs, and
cuid-like path segments to `:id`. GraphQL execution metrics use only the
bounded operation type (`query`, `mutation`, `subscription`, or `unknown`), not
client-supplied operation names, to avoid unbounded Prometheus label
cardinality. Execution errors are counted even when GraphQL returns them with
HTTP 200; parse/validation and transport failures remain visible in the HTTP
status series when Yoga returns a non-2xx response.

No endpoint, response, or authentication behavior changes. Deploy the backend
before importing the dashboard so the GraphQL metrics are present. Route
metrics are process-local Prometheus counters and histograms; aggregate across
instances with PromQL `sum` before calculating quantiles or error ratios.
