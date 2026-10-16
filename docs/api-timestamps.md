# API timestamp format

All JSON response values that are complete ISO-style date-time strings use UTC and exactly millisecond precision: `YYYY-MM-DDTHH:mm:ss.sssZ`. JavaScript `Date` values and RFC 3339 strings with offsets are normalized to this format. Date-time strings without a timezone are interpreted as UTC. Date-only strings such as `YYYY-MM-DD` are not timestamps and remain unchanged.

This format is applied centrally by Express JSON serialization, including successful and error JSON responses. It does not alter numeric Unix timestamps, non-date strings, or date-only values.

## Compatibility

Clients should parse API timestamps as UTC instants rather than depend on a source-specific offset or fractional-second precision. Deployments do not need a database migration; the change affects JSON wire formatting only. Network profiles use the same UTC representation.
