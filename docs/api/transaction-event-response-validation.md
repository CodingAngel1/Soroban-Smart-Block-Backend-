# Transaction and event response validation

`GET /api/v1/transactions`, `GET /api/v1/transactions/:hash`,
`GET /api/v1/events`, and `GET /api/v1/events/:id` validate service results
against Zod response schemas before sending them.

Valid responses retain their existing JSON shape, pagination modes, and extra
fields. If an internal result violates the required core field types, the
request returns HTTP 500 with `code: "RESPONSE_SCHEMA_VALIDATION_FAILED"`.
Validation details are logged server-side and are not returned to callers.
This prevents malformed database or service results from being reported as
successful API responses.

The schemas are additive-compatible: they enforce required core fields while
allowing extra response properties. No database migration, client change, or
feature-flag rollout is needed. This behavior is shared by all network profiles;
`STELLAR_NETWORK` still selects the backend's active network and is not changed
by response validation.
