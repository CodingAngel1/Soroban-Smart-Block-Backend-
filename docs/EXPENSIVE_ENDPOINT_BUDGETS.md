# Expensive endpoint budgets

The API now mounts the request-timeout middleware so the route policies in
`src/middleware/requestTimeout.ts` are enforced. Health and ordinary API
requests use `TIMEOUT_FAST_MS` (5 seconds) and `TIMEOUT_NORMAL_MS` (30 seconds)
respectively. Analytics, archive, export, and compute-heavy API routes
(`simulate`, `verify`, `compiler`, `query`, and `aa`) use `TIMEOUT_LONG_MS`
(5 minutes); bulk routes use `TIMEOUT_EXTENDED_MS` (15 minutes). The timeout
environment variables remain the operational override and are not network
specific.

Non-streaming JSON responses are also capped by route group:

| Route group | Maximum serialized response |
| --- | ---: |
| `/api/v1/batch/*` | 2 MiB |
| Analytics, DEX analytics, portfolio, simulation, verification, compiler, and query routes | 5 MiB |

The server never truncates an over-budget representation. It returns HTTP 500
with code `RESPONSE_TOO_LARGE` and logs the response size and configured cap.
Clients should paginate or narrow filters and retry; exports that need larger
payloads should use a streaming/download contract rather than raising this
JSON cap. Existing 1 MiB request-body limits are unchanged. These limits apply
equally on mainnet, testnet, and devnet; network selection does not change
timeout or response-size budgets.

These enforcement points are additive to existing status/headers except where
a response exceeds its new budget or execution timeout. Operators should
monitor `RESPONSE_TOO_LARGE` logs and `REQUEST_TIMEOUT` responses before
adjusting the current limits. No migration is required.
