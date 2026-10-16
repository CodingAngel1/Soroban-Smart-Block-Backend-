# Batch API partial-success contract

The `POST /api/v1/batch/events`, `/transactions`, and `/accounts` endpoints keep
the existing ordered `data` array and `missing` or `inactive` lists. They now
also return an `errors` array. Each error identifies an input by its zero-based
`index` and has a stable `code`:

- `INVALID_ITEM`: the array element is not a string; other valid elements are
  still looked up.
- `LOOKUP_FAILED`: the backend could not complete that item's lookup. The item
  is `null` in `data` and is not reported as missing/inactive.

An ordinary absent record remains `null` in `data` and is reported in `missing`
or `inactive`; it is not an error. The top-level array must still contain
between 1 and 100 values. A failed shared event/transaction/account-stat lookup
returns HTTP 503 and marks the affected valid entries `LOOKUP_FAILED`. Individual
account event-count failures do not prevent successful account items from being
returned.

This is additive for existing clients that ignore unknown response fields.
Clients that validate response objects strictly should allow `errors`. The
response item order remains identical to the request. The endpoints' Prisma
client is bound to the active deployment profile. `X-Network` does not switch
the batch endpoints to another network's database; deploy each network against
its corresponding profile and do not treat that header as a database selector
for these endpoints. No migration or feature flag is required.
