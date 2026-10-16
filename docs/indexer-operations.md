# Indexer worker controls

Operators can inspect and change the configured indexer's persistent pause
state with the admin API:

```sh
curl -H "x-admin-token: $ADMIN_API_KEY" https://<api>/api/v1/admin/indexer/control
curl -X POST -H "x-admin-token: $ADMIN_API_KEY" https://<api>/api/v1/admin/indexer/pause
curl -X POST -H "x-admin-token: $ADMIN_API_KEY" https://<api>/api/v1/admin/indexer/resume
```

The state is stored per configured `STELLAR_NETWORK` in `_indexer_states`.
Pause takes effect at the next completed processing batch; a batch already
being indexed is allowed to finish and its ledger cursor/checkpoint is saved.
The worker keeps its polling/websocket process alive but does not start new
ledger work. A paused state survives process restarts until an operator resumes
it.

Apply the worker-pause migration before deploying the new API/indexer code:

```sh
npm run prisma:deploy
```

The migration defaults existing workers to unpaused, so rollout does not stop
existing indexing. Keep each network's indexer connected to that network's own
database and RPC profile; do not use a mainnet API instance to control a
testnet-only worker.
