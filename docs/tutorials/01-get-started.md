# Get started

Create a developer API key and use it for a first indexed-data query.

## Prerequisites

1. Start the backend (`docker compose up`) and note its origin, such as
   `http://localhost:3000`.
2. Obtain an existing developer account ID. To register locally, send
   `POST /api/v1/developer/auth/register` with a valid `email` and a password
   of at least eight characters; the response contains `developer.id`.
3. Ensure the backend has indexed data on its configured Stellar network. The
   transaction endpoint reads the network selected by the backend deployment
   (for example, `STELLAR_NETWORK=testnet`); the query does not select a
   different network per request.

## Create a key and make the first query

Run the smoke test with the account ID:

```sh
BASE_URL=http://localhost:3000 \
DEVELOPER_ID=your-developer-id \
node docs/tutorials/examples/01-get-started.mjs
```

The script creates a key through `POST /api/v1/developer/keys`, then sends
`GET /api/v1/transactions?limit=1` with that key in `X-Api-Key`. The raw key is
held only for the query, is never printed, and is returned by the API only on
creation. The script prints the created key ID so it can be revoked with
`DELETE /api/v1/developer/keys/{id}?developerId=your-developer-id` when no
longer needed. For a smoke test using an existing key instead, set `API_KEY`;
in that mode `DEVELOPER_ID` is not required and the script does not create a
key.

The process exits nonzero and reports the HTTP status if key creation or the
first query fails. A successful response prints the transaction result.

Next: [Tutorial index](README.md)
