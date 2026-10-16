# Public API error codes

Every HTTP response with a status of `400` or higher includes a top-level
string `code`. Existing endpoint-specific fields and structured error details
are preserved. Where a response already has a machine-readable
`error.code` or top-level `code`, that value is preserved and exposed at the
top level.

Clients should branch on `code`, not on human-readable messages or nested
validation text. Codes are stable API contract values; message wording and
validation details may change.

| HTTP status | Default code             |
| ----------- | ------------------------ |
| 400, 422    | `VALIDATION_ERROR`       |
| 401, 403    | `AUTH_ERROR`             |
| 404         | `NOT_FOUND`              |
| 405         | `METHOD_NOT_ALLOWED`     |
| 408         | `REQUEST_TIMEOUT`        |
| 409         | `CONFLICT`               |
| 410         | `GONE`                   |
| 413         | `PAYLOAD_TOO_LARGE`      |
| 415         | `UNSUPPORTED_MEDIA_TYPE` |
| 429         | `RATE_LIMITED`           |
| 502, 504    | `EXTERNAL_SERVICE_ERROR` |
| 503         | `SERVICE_UNAVAILABLE`    |
| Other 4xx   | `HTTP_ERROR`             |
| Other 5xx   | `INTERNAL_ERROR`         |

Some endpoints return a more specific code. Examples include `INVALID_CURSOR`
for malformed or query-mismatched REST pagination cursors and
`NOT_ACCEPTABLE` for unsupported API-version negotiation. Such endpoint codes
take precedence over the status default.

```json
{
  "error": "Resource not found",
  "code": "NOT_FOUND"
}
```
