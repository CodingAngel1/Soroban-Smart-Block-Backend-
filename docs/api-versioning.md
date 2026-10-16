# API Versioning and Deprecation Policy

This policy describes how public API contracts change, how endpoint and
version deprecations are announced, and what clients should expect during
migrations.

## Version selection

The current API is served under `/api/v1`. Clients may also select a major
version with the `Accept-Version` header, for example `Accept-Version: v1`,
`Accept-Version: 1.0`, or `Accept-Version: 1.x`. If omitted, the server
defaults to `v1`. Unsupported or retired versions receive `406 Not Acceptable`.
The `API_VERSIONS` registry in `src/middleware/versioning.ts` is the source of
truth for supported versions.

Every negotiated response includes `X-API-Version`. Responses for a deprecated
version also include `Deprecation: true`, a `Sunset` date when configured, and
a `Link` to this policy. These headers currently describe the negotiated API
version; they are not emitted per endpoint. Endpoint-specific deprecations
must therefore also be announced in the endpoint's API documentation and
release notes.

## Compatible and breaking changes

Changes within a major version are additive and backward-compatible. Examples
include adding an endpoint, an optional request field, a response field, or a
new documented error code. Clients should ignore response fields they do not
recognize and handle documented error codes rather than matching message text.

A change is breaking if an existing client can no longer make the same valid
request or interpret its response as before. Examples include removing or
renaming an endpoint or field, changing a field's type or meaning, making an
optional field required, tightening accepted input, changing authentication
requirements, or changing pagination/cursor semantics. Breaking changes belong
in a new major API version, not in an active version. A new major version must
be announced with migration guidance and supported alongside the old version
during its deprecation window.

## Endpoint and version deprecation lifecycle

Deprecation follows these stages:

1. **Active** — The endpoint or version is supported. New integrations should
   use it.
2. **Announced** — Publish the reason, replacement (if any), migration steps,
   and planned retirement date in release notes and API documentation. Provide
   at least **six months' notice** before removal. Keep the existing behavior
   available during this period.
3. **Deprecated** — Mark the version `deprecated` in `API_VERSIONS` and set a
   `sunset` date, or mark an individual endpoint deprecated in its API
   documentation. For a deprecated version, the middleware emits the
   `Deprecation`, `Sunset`, and `Link` response headers. Continue to document
   and support the replacement throughout the migration window.
4. **Retired** — After the announced sunset date, remove the endpoint or mark
   the version `retired`. Requests for a retired version return `406 Not
Acceptable`; a removed endpoint returns `404 Not Found`. Update the OpenAPI
   document and migration notes at retirement.

The six-month window is a minimum. A longer period may be announced when
client migration, deployment cadence, or data retention needs warrant it.
Security or legal emergencies may require a shorter window; document the
reason, affected operations, and client action as early as possible.

Before announcing a retirement, identify a replacement or explicitly state
that none is available. Do not silently redirect a retired operation to a
different operation with different semantics.

## Network and deployment implications

The same API contract and deprecation dates apply on Stellar mainnet, testnet,
and devnet unless an announcement explicitly documents a staged rollout.
Network-specific data, identifiers, and results are expected to differ and do
not by themselves constitute contract changes. A staged rollout must name the
affected networks and dates, and clients must not assume that pagination tokens
or other network-bound state can be moved between networks.

Operational changes such as rotating cursor-encryption secrets can invalidate
saved cursors; deployment and client restart guidance is documented in
[Opaque API cursors](api-cursor-pagination.md). Such compatibility impacts
must be announced alongside the deployment instructions.

## Response headers

Example headers on a response for a deprecated API version:

This document outlines the API versioning strategy, Accept-Version header negotiation, deprecation headers, and the lifecycle policy for the Soroban Smart Block Explorer API.

## Versioning Strategy

REST endpoints are mounted under `/api/v1`. The `Accept-Version` header negotiates the version within that mounted API (for example, `v1`, `1.0`, or `1.x`); if omitted, the middleware selects `v1`. The middleware does not rewrite unversioned `/api/*` paths. A request that selects an unsupported version (for example, `v2`) receives `406 Not Acceptable`.

The registry currently contains only active `v1`. Health and operational routes mounted outside `/api/v1` (such as `/healthz`, `/readyz`, and `/status`) are not part of the versioned REST API.

## Response Headers

For every negotiated request, the API includes metadata about the version and its lifecycle status in the response headers:

- `X-API-Version`: The version that was negotiated and served (e.g., `v1`).
- `Deprecation`: If `true`, indicates that this version is deprecated.
- `Sunset`: The date/time when this version will be completely retired (RFC 7231 format).
- `Link`: A link relation referencing this policy for deprecation details.

Example headers on a deprecated `v1` endpoint response:
```http
X-API-Version: v1
Deprecation: true
Sunset: Wed, 11 Nov 2026 23:59:59 GMT
Link: <https://api.example.com/docs/versioning>; rel="deprecation"; type="text/html"
```

## Lifecycle Policy

To allow the platform to evolve while supporting existing integrations, versions transition through three stages:

1. **Active**: The version is fully supported, actively maintained, and recommended for new integrations.
2. **Deprecated**: The version is functional but scheduled for retirement. A `Deprecation` header is attached, and a `Sunset` date is set. New features are not backported.
3. **Retired**: The version is no longer available. Requests to retired paths or versions will return `406 Not Acceptable` or `404 Not Found`.

## Version Registry

Supported versions live in `API_VERSIONS` in `src/middleware/versioning.ts` (`active`, `deprecated` with a `sunset` date, or `retired`). `versioningMiddleware` is mounted on `/api/v1`; `Deprecation`, `Sunset` and `Link` headers are emitted only for versions marked `deprecated`. `v1` is currently `active`.

## Endpoint-Family Compatibility Matrix

The following matrix describes the currently supported REST families. All listed paths are served as `/api/v1` paths and currently share the active `v1` lifecycle. The family groupings are for compatibility planning; each endpoint's OpenAPI operation remains authoritative for its exact fields, validation, and status codes.

| Family | Representative paths | Compatibility notes |
| --- | --- | --- |
| Indexed chain data | `/transactions`, `/events`, `/contracts`, `/tokens`, `/wallets/*`, `/stellar/*`, `/token-metadata/*` | `/transactions` and `/events` offer the shared opt-in cursor contract (`?pagination=cursor&limit=20`, then pass `nextCursor` as `cursor`). Legacy offset and endpoint-specific cursor forms remain available for compatibility. New cursor pages return `{ data, nextCursor, hasNext }`; changing field types, ordering guarantees, or cursor semantics is breaking. See [Stable Cursor Pagination](cursor-pagination.md). |
| Search and analysis | `/search/*`, `/analytics/*`, `/dex*`, `/market/*`, `/portfolio/*`, `/nft/*`, `/gas/*`, `/oracles/*` | Query filters are endpoint-specific. New optional filters and additive result fields are compatible; existing filter meanings and result types must remain stable. |
| Batch and execution | `/batch/*`, `/simulate/*`, `/verify/*`, `/compiler/*`, `/sandbox/*`, `/aa/*` | Batch payload/result shapes are operation-specific. Simulation, verification, compilation, and account-abstraction operations may have additional API-key or developer-tier requirements; do not infer access from the family name. |
| Account and protocol operations | `/authorizations/*`, `/protocol/*`, `/compliance/*`, `/bridge-tracker/*`, `/zkp-verifications/*` | Protocol-specific fields and validation remain endpoint-specific. Changes to network-specific interpretation or required inputs require explicit compatibility notes. |
| Developer and administration | `/developer/*`, `/admin/*`, `/freeze/*`, `/webhooks/*` | Authentication and authorization requirements vary by operation. Security-sensitive write routes retain their existing guards; the API version does not imply public access. |
| Streaming | `/feed/*`, `/realtime/*` | Streaming event schemas are versioned with the API family that serves them; consumers must tolerate additive event fields and preserve handling of existing event types. |

For the full path/method/schema inventory, use the generated OpenAPI document at `/api/v1/openapi.json` or the interactive `/api/docs`. This matrix is a compatibility summary, not a substitute for operation-level documentation.

## No Breaking Changes Within a Version

Within a major version only additive changes are allowed: new endpoints, new optional request fields, new response fields. Removing or renaming fields/endpoints, changing types, or tightening validation requires a new major version.

## Current status

`v1` is currently active. No API version or endpoint is currently marked for
retirement in the version registry. The opaque-cursor rollout documented in
[Opaque API cursors](api-cursor-pagination.md) is a one-time compatibility
migration within v1: saved legacy cursors are invalidated and clients must
restart pagination. Future breaking changes must follow the versioning and
deprecation lifecycle above; any planned exception affecting an active v1
contract must be called out explicitly in release notes and endpoint
documentation.
