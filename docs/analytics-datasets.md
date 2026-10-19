# Analytics datasets

Public dataset snapshots are published through `src/api/public-datasets.ts`
(`/api/v1/datasets`) from files produced by the CDC → transform → Parquet/Iceberg
pipeline in `src/analytics/`.

## Lineage (#1245)

Every published manifest now records:

- `network` — the deployment's network profile (`STELLAR_NETWORK`); each
  profile runs its own pipeline, so a manifest only ever describes one network.
- `etlJobIds` — the ETL jobs whose output files make up the snapshot. Pass them
  in the publish body (`POST /datasets/:dataset/manifests`, optional, ≤ 100,
  de-duplicated).

`GET /api/v1/datasets/:dataset/manifests/:id/lineage` joins the manifest with
each job's `EtlLineageRecord` (`src/analytics/data-quality/checks.ts`) and
returns, per job, the CDC source tables, PostgreSQL tx-id and WAL LSN ranges,
the Parquet files written and the ledger range they cover
(`src/analytics/lineage.ts`). `complete` is `false` with `issues` when:

| code               | meaning                                                         |
| ------------------ | --------------------------------------------------------------- |
| `no_jobs`          | manifest was published without `etlJobIds`                     |
| `job_not_found`    | no lineage record for a referenced job                          |
| `job_failed`       | a referenced job finished with status `failed`                  |
| `network_mismatch` | a job's `network` differs from the manifest's network           |
| `ledger_gap`       | part of the manifest's `ledgerRange` is not covered by any job  |

### Compatibility and rollout

- Both manifest fields are additive; existing clients are unaffected. Manifests
  published before this change (or without `etlJobIds`) report `no_jobs`.
- `EtlLineageRecord.network` is optional. ETL jobs should set it to the
  `network_id` they ingested; legacy records without it are not flagged as a
  network mismatch.
- Lineage records live in the ETL process's in-memory store (S3-backed in
  production); publish manifests from the process that ran the jobs, or lineage
  reports `job_not_found`.
