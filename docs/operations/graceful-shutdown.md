# Graceful shutdown

The API handles `SIGTERM` and `SIGINT` by marking itself as shutting down,
returning `503` from liveness/readiness probes, and stopping new HTTP requests.
Requests already in progress are allowed to finish. WebSocket clients receive a
server-shutdown close frame. Connections that remain open after five seconds
are destroyed so they cannot hold pod termination indefinitely.

After HTTP draining, the API stops recurring workers and waits for active
scheduled jobs, indexer work, webhook delivery, bridge polling, and price
updates before closing Redis, PostgreSQL, and the event bus. The configured
`SHUTDOWN_TIMEOUT_MS` remains the hard process deadline (30 seconds by default);
work that exceeds that deadline can be interrupted. The Kubernetes API
deployments allow 40 seconds for termination, leaving time for the application
deadline and container exit.

No database migration or Stellar-network-specific rollout is required. The
behavior applies equally to testnet, mainnet, and devnet API pods. Deployments
using a shorter orchestrator termination grace period should increase it to
cover `SHUTDOWN_TIMEOUT_MS`.
