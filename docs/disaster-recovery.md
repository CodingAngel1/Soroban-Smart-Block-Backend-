# Disaster Recovery Objectives and Exercise

## Service objectives

These are initial operational objectives for the Soroban explorer backend, not
a claim that every database provider or deployment currently meets them:

| Measure | Objective | Measurement |
| --- | --- | --- |
| Recovery Point Objective (RPO) | At most 15 minutes of database changes lost | Incident simulation time minus the provider's latest restorable timestamp |
| Recovery Time Objective (RTO) | Service restored within 60 minutes | Time from declaring the simulated incident to successful application readiness and verified database service |

Meeting the RPO requires database backups plus continuous WAL/PITR retention with
a restorable point no more than 15 minutes behind. A logical `pg_dump` and
restore, including the release drill in
[the PostgreSQL restore runbook](postgres-backup-restore-drill.md), validates
backup readability and restore compatibility; by itself it does not prove PITR
or the RPO. Confirm that the configured PostgreSQL provider and retention policy
support both objectives before treating them as an achieved SLO.

The database restore command's duration is not the whole-service RTO. Include
database recovery, schema/application compatibility checks, deployment,
readiness verification, and any required indexer catch-up in the RTO clock.
Escalate rather than silently declaring success if either objective is missed.

## Exercise procedure

Run this exercise quarterly, before a production release that changes database
schema or backup configuration, and after changing the PostgreSQL provider.
Exercise each production database independently in an isolated staging
environment; never restore a drill over a production database.

1. Record the UTC start time when the incident is declared. Choose a simulated
   recovery time at least 15 minutes in the past and confirm the provider can
   restore a staging database to that point.
2. Restore the staging database to an isolated database using the provider's
   PITR procedure. Record the latest restorable timestamp shown by the provider
   and the timestamp actually restored. Calculate RPO as the interval between
   the simulated incident time and the recovered point; pass only at 15 minutes
   or less.
3. Follow the PostgreSQL backup-restore runbook against a disposable target to
   verify a portable logical backup can also be restored. Do not use this
   logical backup as evidence that PITR passed.
4. Apply the documented application release/migration procedure to the
   recovered staging database. Verify database connectivity, `/readyz`, and
   representative reads before directing staging traffic to it.
5. For every enabled Stellar network profile (for example testnet, mainnet, or
   devnet), verify the expected database and RPC configuration. Confirm the
   indexer resumes at the recovered ledger and catches up using that network's
   configured RPC endpoint and rate limits. Chain-derived data may be
   re-indexed from Stellar, but application-owned state such as users, API
   keys, and webhook records still depends on database recovery.
6. Stop the clock only after the service is ready and the required network
   indexers have resumed. Calculate RTO from the incident declaration; pass
   only at 60 minutes or less. Record provider, database/network profile,
   timestamps, RPO, RTO, validation results, and any corrective actions in the
   operational incident record.

If the provider cannot expose a sufficiently recent PITR point, the restored
database is inconsistent, or readiness/indexer recovery misses its limit,
record the objective as failed and open remediation before relying on the
recovery plan. Preserve normal production backup retention and access controls;
the exercise data must remain in the isolated staging environment.
