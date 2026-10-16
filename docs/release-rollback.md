# Application Release Rollback

## Automatic rollback on release failure

The CD workflow attempts `kubectl rollout undo` and waits for rollout health if
applying a release or waiting for its Deployment rollout fails after a cluster
has been configured. The original deployment job remains failed even if
rollback succeeds. A rollback failure is also surfaced in that job's logs and
requires operator intervention.

## Manual rollback

Use the **Rollback Release** workflow with the affected environment (`staging`
or `production`) and Stellar network (`testnet` or `mainnet`). Environment
reviewer gates apply as configured. The workflow requires the selected
environment's `KUBE_CONFIG_STAGING` or `KUBE_CONFIG_PRODUCTION` secret and fails
if it is absent; the kubeconfig is not printed or uploaded.

For a manual rollback from a trusted operator shell with `kubectl` configured:

```sh
bash scripts/rollback-release.sh soroban soroban-api
bash scripts/rollback-release.sh soroban soroban-api-mainnet 12
```

The optional revision must be a positive Kubernetes Deployment revision. Without
it, Kubernetes selects the previous revision. Inspect available revisions
before choosing a specific one with `kubectl rollout history deployment/<name>
-n soroban`. The script waits up to five minutes for the selected deployment to
become healthy and returns a non-zero status if `kubectl` cannot undo or verify
the rollout.

## Compatibility and recovery limits

This procedure reverts application containers and Deployment configuration; it
does not reverse database migrations or restore database contents. Keep schema
migrations backward-compatible with the previous application revision during
the rollout window. If a migration is not backward-compatible, stop automated
rollback and use the [disaster recovery procedure](disaster-recovery.md) to
recover the database before directing traffic. Verify the selected network's
`/readyz` endpoint and indexer progress after rollback; mainnet and testnet use
separate deployments and network-specific RPC configuration.
