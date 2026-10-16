# Raw transaction XDR retention and retrieval

The indexed transaction envelope is stored in `Transaction.rawXdr` as base64 and retained for the lifetime of its transaction row. There is no XDR-specific TTL or pruning job. It is public ledger data; application rollback for a ledger reorganization may remove affected transaction rows along with the indexed ledger data.

Retrieve a stored envelope through `GET /api/v1/transactions/{hash}/xdr`. A successful response is JSON with `transactionHash`, `encoding: "base64"`, and `xdr`. Decode the value as a Stellar `TransactionEnvelope` using the Stellar SDK. The ordinary transaction list and detail responses do not include this potentially large field.

If a transaction is indexed after both RPC and Horizon fail to return its envelope, the transaction record may have an empty `rawXdr`; retrieval returns `404` with `Raw transaction XDR is not available`. This is an availability limitation, not a signal that the transaction does not exist. Retry/backfill from a healthy archival provider is required to recover the envelope. Retention is scoped to the database/network selected by the API deployment.

Keeping complete envelopes indefinitely increases database and backup size with chain growth. Any future archival or expiry policy must preserve the retrieval contract or explicitly version it, and must account for all deployed network databases before rollout.
