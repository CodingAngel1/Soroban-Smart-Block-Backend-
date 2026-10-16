# Backfill dry-run reports

Operators can estimate a backfill before creating a job:

```http
POST /api/v1/feed/backfill/dry-run
x-operator-token: <operator-token>
Content-Type: application/json
```

The JSON body uses the same `channelName`, `startTime`, `endTime`, and `format`
fields and validation limits as `POST /api/v1/feed/backfill`. The response
reports the selected network, estimated record count and file size, configured
limits, and any limit warnings. It does not create a request or enqueue work.
Use the regular `POST /api/v1/feed/backfill` endpoint to start the job after
reviewing the report.

Estimates are based on current database counts and format-specific average
bytes per record; they are not reservations or guarantees. Data can change
between the report and job creation. Transaction, event, and ledger counts are
filtered by the configured Stellar network. Trade and metric records do not
currently expose a network field, so those counts use the active backfill
database profile and time range only. A count-query failure returns an error
instead of a synthetic estimate; no backfill request is created in that case.
