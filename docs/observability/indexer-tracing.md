# Indexer trace spans

The indexer emits OpenTelemetry spans around each ledger-range pass and its
fetch/decode/persist operations. `indexer.ledger_range` contains the inclusive
range; child spans cover metadata and event fetches, transaction/event decoding,
and ledger/transaction/event persistence. Spans carry `network.name` and the
ledger sequence or range so traces can be filtered without high-cardinality
ledger labels on Prometheus metrics.

Exceptions propagate to the existing `withSpan` helper, which marks failed
spans as errors while preserving the indexer's existing retry and cursor
behavior. A failed database persistence therefore appears as an errored span
and still prevents normal cursor advancement.

Trace export uses the existing `OTLP_ENDPOINT` configuration and sends OTLP
HTTP traces to `${OTLP_ENDPOINT}/v1/traces`; no new exporter or database
configuration is required. Deployments must provide a reachable OTLP
collector, otherwise spans are not retained. `network.name` reflects the
active `STELLAR_NETWORK` profile; each network should be analyzed separately
because ledger sequences are network-local.

The spans are additive and do not change API responses, persistence schema, or
indexer retry policy. Validate the pipeline with:

```sh
TESTNET_DATABASE_URL=postgresql://test:test@localhost:5432/test \
STELLAR_NETWORK=testnet CACHE_URL=memory:// \
npm test -- tests/indexer/pipeline-spans.test.ts
```
