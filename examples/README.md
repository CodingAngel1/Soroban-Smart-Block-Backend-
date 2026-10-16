# SDK example apps

Self-contained examples built on `@soroban-explorer/client`. Each reads `API_URL` (default `http://localhost:3000`).

| Example      | Run                                                                       | Description                                                       |
| ------------ | ------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `bot/`       | `npx ts-node examples/bot/index.ts`                                       | Reads `score <addr>`, `badges <addr>`, `top` commands from stdin. |
| `dashboard/` | `npx ts-node examples/dashboard/index.ts`                                 | Prints the reputation leaderboard.                                |
| `alerting/`  | `ADDRESSES=G...,G... THRESHOLD=50 npx ts-node examples/alerting/index.ts` | Polls scores every minute and warns when below the threshold.     |

Start the API first (`npm run dev`). The examples are sanity-tested in CI by `tests/examples/examples.test.ts`, which runs them against a stubbed fetcher.

## Mainnet and testnet API

Set each URL to the base URL of the corresponding Explorer API deployment,
including `/api/v1` (do not use a Stellar RPC or Horizon URL). Supply
`SOROBAN_API_KEY` when the deployment requires an API key:

```bash
export SOROBAN_MAINNET_API_URL="https://<mainnet-explorer-host>/api/v1"
export SOROBAN_TESTNET_API_URL="https://<testnet-explorer-host>/api/v1"
export SOROBAN_API_KEY="your-api-key" # optional for public API access

npx ts-node examples/networks/mainnet.ts
npx ts-node examples/networks/testnet.ts
```

Each example requests the latest five transactions and events and prints the
JSON responses. The SDK does not choose a network for you: mainnet and testnet
are separate backend deployments selected by `STELLAR_NETWORK` on the server.
The examples require an explicit URL per network to prevent accidental
cross-network requests. They are tested with a stubbed HTTP transport in
`tests/examples/network-usage.test.ts`.
