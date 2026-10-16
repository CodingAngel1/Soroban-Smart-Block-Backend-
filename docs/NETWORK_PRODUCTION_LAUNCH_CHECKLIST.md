# Network-specific production launch checklist

Use this checklist for every production deployment. Deploy each Stellar network
as an isolated application profile, database, cache namespace, and set of
credentials. The process fails during profile loading if the active network is
unknown, a required endpoint is absent, or the configured passphrase is not the
canonical passphrase for that network (`tests/startup-validation.test.ts`).

## Shared gates

- [ ] Select exactly one network with `STELLAR_NETWORK`; do not route production
  traffic between networks using a request header.
- [ ] Set that network's database, RPC, WebSocket RPC, and Horizon variables.
  Do not reuse a database or cache namespace between networks.
- [ ] Compare the RPC `getNetwork` response passphrase with the selected
  network's canonical passphrase below before deploying. Do not rely on a
  hostname alone: managed RPC providers may use generic hostnames.
- [ ] Use production secrets and TLS; restrict database, RPC, cache, and
  `/metrics` access to the service and monitoring systems.
- [ ] Apply database migrations to the selected network database and verify
  `/health`, `/readyz`, and `/metrics` before shifting traffic.
- [ ] Roll out one network at a time. Verify its health, indexer lag, API 5xx
  rate, and database/cache status before proceeding to another network.
- [ ] Roll back by restoring that network's prior image/configuration and
  routing. Never point a rollback at another network's database.

## Per-network gates

| Network | Canonical passphrase | Endpoint / data checks | Production-specific checks |
| --- | --- | --- | --- |
| `mainnet` | `Public Global Stellar Network ; September 2015` | `MAINNET_RPC_URL`, `MAINNET_RPC_WS_URL`, `MAINNET_HORIZON_URL`, `MAINNET_DATABASE_URL`, and optional `MAINNET_READ_REPLICA_URL` must all address mainnet. Startup rejects testnet URLs and a non-canonical passphrase. | Use a dedicated production database and authenticated, highly available RPC/cache endpoints. Do not use the `memory://` cache fallback for a multi-replica launch. Smoke-test read endpoints against known mainnet ledgers before opening writes. |
| `testnet` | `Test SDF Network ; September 2015` | `TESTNET_RPC_URL`, `TESTNET_RPC_WS_URL`, `TESTNET_HORIZON_URL`, `TESTNET_DATABASE_URL`, and optional `TESTNET_READ_REPLICA_URL` must address testnet. | Keep testnet credentials, database, and cache isolated from mainnet. Use testnet transactions to exercise the complete write/index/decode flow before a mainnet rollout. |
| `devnet` | `Standalone Network ; February 2017` | `DEVNET_RPC_URL`, `DEVNET_RPC_WS_URL`, `DEVNET_HORIZON_URL`, `DEVNET_DATABASE_URL`, and optional `DEVNET_READ_REPLICA_URL` must address the intended standalone network. | Production deployment is only appropriate for a managed, persistent devnet; the defaults are local Quickstart endpoints and are not production infrastructure. Verify the intended network passphrase and ledger reset/retention policy. |

## Rollout and rollback

1. Run `npm test -- tests/startup-validation.test.ts` and `npm run typecheck`
   for changes to network-profile validation.
2. Confirm the active network in the deployment environment and verify the RPC
   `getNetwork` passphrase from the same network path the application will use.
3. Deploy a canary for that profile. Confirm `/health` reports the expected
   `network`, `/readyz` succeeds, and a known ledger lookup returns data from
   that network.
4. Shift traffic gradually while watching `indexer_ingestion_lag_ledgers`,
   `http_5xx_surge_ratio`, database connection status, and cache status.
5. If any check fails, stop the rollout and restore the previous image/config.
   Keep the network selection and database pairing unchanged during rollback.

Do not use this checklist as a substitute for the network operator's RPC,
database, and key-management runbooks. Mainnet production changes must be
reviewed independently from testnet/devnet configuration changes.
