# Stable Cursor Pagination

`GET /api/v1/transactions` and `GET /api/v1/events` support the same opt-in cursor contract. Existing offset and endpoint-specific cursor requests remain available and retain their existing response shapes.

## Request

Start a cursor-paginated request by setting `pagination=cursor`. Continue by sending the returned `nextCursor` as `cursor` and keep the same filters and `limit`:

```http
GET /api/v1/transactions?pagination=cursor&limit=20&contract=C...
GET /api/v1/transactions?pagination=cursor&limit=20&contract=C...&cursor=c1_...
```

`limit` defaults to 20 and must be between 1 and 100. Cursors are opaque, endpoint-bound continuation tokens; clients must not parse or construct them. A cursor from the event list cannot be used for transactions, and vice versa. Keep requests on the same configured Stellar network and preserve the original filters across pages.

## Response

Both list endpoints return the same shape in stable cursor mode:

```json
{
  "data": [],
  "nextCursor": "c1_...",
  "hasNext": true
}
```

`nextCursor` is the position after the last item in `data`, or `null` when no further page exists. `hasNext` is determined by fetching one item beyond the requested limit. The cursor uses the endpoint's descending `(ledgerSequence, id)` ordering, so records sharing a ledger are not skipped between pages. Cursor mode does not calculate a total count.

The cursor is a continuation position, not a database snapshot: records indexed while a client is paging are not guaranteed to appear in that traversal. Clients needing a fixed historical boundary should constrain the query with the endpoint's supported ledger filters.

## Compatibility and rollout

Cursor mode is additive in API `v1` and must be requested explicitly with `pagination=cursor`. Existing callers that use `page`, numeric transaction `cursor`, or event-id `cursor` continue to use the legacy behavior. Clients can migrate one endpoint at a time by enabling cursor mode, treating `nextCursor` as an opaque string, and stopping when it is `null` or `hasNext` is `false`.

Cursor tokens are tied to their resource type, but not to a network identifier. Do not reuse one across testnet, mainnet, or devnet. Changing the cursor format, ordering, or response field types is a breaking change and requires the API versioning policy to be followed.
