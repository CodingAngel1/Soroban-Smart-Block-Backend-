# Network selection and defaults

Each backend instance serves exactly one Stellar network. `STELLAR_NETWORK` selects its profile at startup (`testnet` by default); the profile contains that instance's RPC, Horizon, database, cache, and network passphrase settings. Run separate instances and route traffic to the appropriate instance to serve more than one network.

Every HTTP endpoint uses the same startup-selected profile and returns it in the `X-Network` response header. `GET /api/v1/network` reports the same network and its RPC/passphrase details. A request may identify its intended network with `X-Network` or with a network-prefixed host such as `testnet-api.example.com`, but these selectors do not dynamically switch connections:

1. A supplied `X-Network` header takes precedence over the host. Unknown values receive `400`; a valid network that differs from the instance receives `400`.
2. Without `X-Network`, a recognized network-prefixed host must match the instance or the request receives `421 Misdirected Request`.
3. Other hosts default to the instance's `STELLAR_NETWORK` profile (`testnet` if unset).

The `X-Network` response header is exposed to browser clients. Existing clients that sent a different network selector to a single-network instance must instead route to that network's instance. This prevents an API response from claiming one network while its database and RPC calls are connected to another. Deployments adding a network should configure that profile's `*_DATABASE_URL`, `*_RPC_URL`, `*_RPC_WS_URL`, `*_HORIZON_URL`, and passphrase before routing traffic to its instance.
