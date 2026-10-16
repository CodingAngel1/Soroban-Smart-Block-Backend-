# Stellar RPC degradation and failover

Each network profile accepts an ordered, comma-separated
`<NETWORK>_RPC_FALLBACK_URLS` list. For example:

```dotenv
TESTNET_RPC_URL=https://primary-testnet.example/rpc
TESTNET_RPC_FALLBACK_URLS=https://secondary-testnet.example/rpc,https://tertiary-testnet.example/rpc
```

Requests begin at the currently selected endpoint. Network errors, HTTP 429,
and HTTP 5xx responses advance to the next configured endpoint; 4xx client
errors do not. A successful fallback becomes the active endpoint for later RPC
calls. Failover attempts are bounded to the configured list and the original
error is returned if every eligible endpoint fails. Without fallback URLs the
behavior remains a single-endpoint request. This does not change Horizon's
existing ledger-metadata fallback and does not rotate the independently
configured RPC WebSocket URL.

The `rpc_endpoint_active{network,endpoint}` gauge reports the selected
endpoint by bounded index (`primary`, `fallback_1`, ...), and
`rpc_endpoint_failovers_total` counts endpoint transitions. The
`StellarRpcSustainedDegradation` alert fires when instrumented RPC calls
continue to fail above a 10% ratio; `StellarRpcEndpointFailover` warns when
fallback is repeatedly used. Endpoint URLs, credentials, and provider names
are not exposed as metric labels or log fields.

Configure all endpoints for the same Stellar network and provider credentials.
Testnet and mainnet fallbacks must use HTTPS; plain HTTP is accepted only for
devnet. Roll out fallback configuration on a canary first, then confirm the
active endpoint metric and network tip before broad deployment. Switching to
another network is not a recovery strategy; each profile's existing network
passphrase remains unchanged. The RPC WebSocket continues to use its configured
primary URL and reconnect behavior.
