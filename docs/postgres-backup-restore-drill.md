# PostgreSQL Backup-Restore Release Drill

The release workflow runs a PostgreSQL custom-format backup and restores it into
an isolated, disposable PostgreSQL 16/pgvector service before a production
release. The restore target is not the source database. The job fails closed
when the backup, archive validation, restore, or restored-database connection
check fails, and its temporary dump is removed when the job exits.

This logical backup/restore check does not demonstrate point-in-time recovery
or satisfy the service RPO by itself. See the
[disaster recovery objectives and exercise](disaster-recovery.md) for RPO/RTO
targets and the separate PITR validation procedure.

## GitHub configuration

Configure a `DATABASE_URL` secret on the `staging` GitHub Environment. It must
allow the GitHub-hosted runner to connect to the staging PostgreSQL database
with read access to the objects included in `pg_dump`. The release drill is
gated by that environment and blocks production promotion if the secret is
missing or the database is unreachable. Do not use a production database URL
for this drill. No backup artifact is uploaded or retained by the workflow.

The isolated restore target uses `pgvector/pgvector:pg16`, matching the
PostgreSQL major version and extension used by CI. The drill does not alter
Stellar network/indexer configuration or write to the source database.

## Run locally

Install PostgreSQL client tools (`pg_dump`, `pg_restore`, and `psql`) and use
an empty, disposable target database on a compatible PostgreSQL major version:

```sh
bash scripts/postgres-backup-restore-drill.sh \
  "$STAGING_DATABASE_URL" \
  "$DISPOSABLE_RESTORE_DATABASE_URL"
```

The script accepts PostgreSQL URLs only and refuses an identical source and
target URL. Keep credentials in environment variables or a secret manager; do
not put them in shell history or logs. The restore target must be isolated and
empty because the procedure intentionally does not drop or clean existing
objects.

## Failure handling

A failed release drill stops promotion. Check the GitHub Actions step output
for the failing PostgreSQL client command without copying database credentials
into logs. Resolve connectivity, permissions, extension/version compatibility,
or restore errors, then rerun the release workflow. Never bypass the restore
failure by restoring into the source database.
