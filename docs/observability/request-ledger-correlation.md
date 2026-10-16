# Request and ledger correlation

Every HTTP request is assigned an `X-Request-Id` (or keeps the incoming
`x-request-id`) and a trace/span context. Incoming B3 IDs are preserved; when
no upstream IDs or active OpenTelemetry span are available, the service
generates valid 32-hex trace IDs and 16-hex span IDs.

Structured log entries include `requestId`, `traceId`, and `spanId` when
available. The active OpenTelemetry span takes precedence over the parent span
ID in async context, so logs inside child spans link to the span doing the
work. Indexer range and reorg messages also include `ledgerSequence` and, for
ranges, `ledgerRangeEnd`.

Axios requests made within the request async context forward `X-Request-Id`
and a W3C `traceparent` header. A 64-bit B3 trace ID is left-padded to the
128-bit W3C representation for downstream propagation. Invalid B3 values are
preserved in local context for compatibility but are not emitted as
`traceparent`.

No response schema or database change is involved. Existing request ID
headers remain unchanged; downstream systems that do not understand W3C
Trace Context can continue to use `X-Request-Id` or B3 headers.
