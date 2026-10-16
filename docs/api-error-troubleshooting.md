# API errors and request-ID troubleshooting

Every error handled by the global API error handler uses the structured error
envelope and includes a correlation ID in both the response header and body:

```http
HTTP/1.1 404 Not Found
X-Request-Id: 550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json
```

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Transaction not found"
  },
  "meta": {
    "requestId": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2026-10-15T16:00:00.000Z"
  }
}
```

Use the `X-Request-Id` response header (or `meta.requestId`) when reporting an
error. The backend accepts an incoming `X-Request-Id` for upstream
correlation; otherwise it generates an ID. The same value is included in
structured server logs.

## Troubleshoot a failed request

1. Record the HTTP status, `error.code`, timestamp, endpoint, and
   `X-Request-Id`. Do not include API keys, authorization headers, or other
   credentials in a support report.
2. For `400` errors, check the request fields and validation details. For
   `401`/`403`, verify that the key is active and has the required access. For
   `404`, confirm the resource identifier and that the requested data exists
   on the deployment's configured Stellar network.
3. For `429`, respect `Retry-After` and inspect the rate-limit headers before
   retrying. For `5xx`, retry only safe/idempotent requests with backoff.
4. Give the operator the request ID and timestamp so they can search the
   structured logs for that request and inspect the associated error details.

The request ID is diagnostic metadata; it does not change the error code,
status, or existing error-envelope shape. It is generated per HTTP request
and is independent of the Stellar network configured for the API deployment.
