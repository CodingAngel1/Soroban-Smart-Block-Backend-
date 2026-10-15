# Benchmarks

This document tracks the performance budgets enforced by CI and the benchmarks
that back them. Every budget below is a hard ceiling: a regression that exceeds
the budget fails the build.

## Materialized-view refresh budgets

`src/analytics/materialized-views` recomputes aggregates (gas/protocol-economics
snapshots, holder analytics inputs) from source tables. Refreshes are currently
full recomputes, so refresh runtime grows with source-table size. To keep
consumers honest about data freshness and to catch unbounded growth early, each
view has a documented **staleness budget** (the maximum acceptable age of the
snapshot) and a **refresh-time budget** (the maximum acceptable wall-clock time
for a full recompute on the seeded fixture).

| View | Staleness budget | Refresh-time budget (seeded fixture) |
| --- | --- | --- |
| `gas_snapshot` | 5 min | 30 s |
| `protocol_economics_snapshot` | 15 min | 60 s |
| `holder_analytics_inputs` | 30 min | 120 s |

### Last-refresh timestamps

The analytics status endpoint exposes the last successful refresh timestamp per
view so dashboards and the analytics routers can distinguish 1-minute-old data
from 1-hour-old data. Consumers compare the reported timestamp against the
staleness budget above and surface a staleness indicator when the budget is
exceeded.

### Refresh-time CI check

A benchmark runs against a seeded fixture and asserts that each view's refresh
completes within its refresh-time budget. The check is wired into CI and fails
the build on violation, so refresh cost cannot silently grow past the budget as
tables grow.

## Incremental refresh (design note)

Full recomputes are the current strategy. For the largest views
(`holder_analytics_inputs`, `protocol_economics_snapshot`), an append-only
delta strategy is the intended direction: persist a per-view watermark of the
last processed source row, then recompute only the delta since that watermark
and merge it into the existing snapshot. This bounds refresh cost by the size of
the delta rather than the size of the source table. It is documented here as a
design note only; the full recompute path remains the source of truth until the
delta path is benchmarked against the budgets above.
