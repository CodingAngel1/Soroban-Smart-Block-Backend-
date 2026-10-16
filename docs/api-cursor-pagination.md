# Opaque API cursors

Cursor pagination for REST transaction, event, NFT list, and wallet journey
routes and the GraphQL transaction, event, and token connections uses
authenticated, encrypted tokens. Clients must treat each cursor as an opaque
string and pass it back unchanged; cursor contents and encoding are not part of
the API contract.

Each token is bound to its API operation, the active Stellar network, page size,
and query filters. Replaying it with a different operation, network, page size,
or filter returns `INVALID_CURSOR` from REST or `BAD_USER_INPUT` from GraphQL.
This prevents a cursor generated for one query from silently changing the
results of another query.

## Compatibility and rollout

Existing numeric transaction cursors, event IDs, NFT row IDs, wallet journey
timestamps, and Base64-encoded GraphQL cursors are no longer accepted. Clients
should discard saved cursors and begin from the first page after deploying this
change. Offset pagination remains available for REST lists that already
support it.

Cursors are encrypted with a key derived from `JWT_SECRET`; changing that
secret invalidates outstanding cursors. This is safe to do during a planned
secret rotation: clients restart pagination when they receive `INVALID_CURSOR`
or `BAD_USER_INPUT`. Configure the same `JWT_SECRET` on every replica serving
the same network so cursors remain usable across instances. Since the active
network is part of the cursor scope, a token from testnet, devnet, or mainnet
cannot be replayed against another network.

Non-production environments without `JWT_SECRET` use a development-only
fallback key. Production deployments must use the required `JWT_SECRET` and
must not rely on that fallback.
