# Deployment smoke tests

`src/deployment-smoke.ts` checks the running API's `/healthz`, confirms every
migration directory in the deployed source revision has a successful record
in `_prisma_migrations`, rejects unfinished migrations, and runs a zero-row
query against the migrated `_ledgers` table. It does not apply migrations.

CI runs the smoke after `prisma migrate deploy` and API startup against its
migrated PostgreSQL service. Staging and production CD run it inside the
updated Kubernetes API pod, using that pod's configured database connection.
The deployment must therefore apply database migrations before the API rollout;
the smoke fails if a migration is missing or incomplete and does not roll back
or mutate the database.

The same checks apply to testnet/staging and mainnet/production because each
pod uses its active network profile's database. The test makes no Stellar RPC
calls, requires no network-specific data, and performs no schema changes.
