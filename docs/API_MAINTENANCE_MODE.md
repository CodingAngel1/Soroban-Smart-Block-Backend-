# API maintenance mode

`API_MAINTENANCE_MODE` controls request access for one server instance and
therefore one `STELLAR_NETWORK` profile. It defaults to `off`; changing the
environment variable takes effect on process restart.

| Value | Read methods (`GET`, `HEAD`, `OPTIONS`) | Write methods |
| --- | --- | --- |
| `off` | Available | Available |
| `reads` | Return `503` | Available |
| `writes` | Available | Return `503` |
| `all` | Return `503` | Return `503` |

Rejected requests receive a JSON `MAINTENANCE_MODE` response with the selected
mode and network. `/health`, `/health/detailed`, `/healthz`, `/livez`, `/ready`,
`/readyz`, and `/metrics` remain available so load balancers, orchestration, and
monitoring can continue to assess the process. Unknown/non-read HTTP methods are
treated as writes.

To drain writes while preserving explorer reads, deploy `reads`; to pause reads
while leaving mutations available, use `writes`; use `all` for a full API
maintenance window. Set the mode independently for each network deployment
(for example, `API_MAINTENANCE_MODE=reads` only on mainnet) and verify the
network label in the maintenance response. Restore `off` after the maintenance
window and roll back by restoring the previous environment value if unexpected
traffic is blocked. Automated failure/compatibility cases are covered in
`tests/middleware/maintenanceMode.test.ts`.
