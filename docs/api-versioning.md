# API Versioning Policy

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
| Indexed chain data | `/transactions`, `/events`, `/contracts`, `/tokens`, `/wallets/*`, `/stellar/*`, `/token-metadata/*` | Read shapes and list-pagination envelopes are endpoint-specific today. Additive response fields are compatible; changing field types, ordering guarantees, or pagination semantics is breaking. |
| Search and analysis | `/search/*`, `/analytics/*`, `/dex*`, `/market/*`, `/portfolio/*`, `/nft/*`, `/gas/*`, `/oracles/*` | Query filters are endpoint-specific. New optional filters and additive result fields are compatible; existing filter meanings and result types must remain stable. |
| Batch and execution | `/batch/*`, `/simulate/*`, `/verify/*`, `/compiler/*`, `/sandbox/*`, `/aa/*` | Batch payload/result shapes are operation-specific. Simulation, verification, compilation, and account-abstraction operations may have additional API-key or developer-tier requirements; do not infer access from the family name. |
| Account and protocol operations | `/authorizations/*`, `/protocol/*`, `/compliance/*`, `/bridge-tracker/*`, `/zkp-verifications/*` | Protocol-specific fields and validation remain endpoint-specific. Changes to network-specific interpretation or required inputs require explicit compatibility notes. |
| Developer and administration | `/developer/*`, `/admin/*`, `/freeze/*`, `/webhooks/*` | Authentication and authorization requirements vary by operation. Security-sensitive write routes retain their existing guards; the API version does not imply public access. |
| Streaming | `/feed/*`, `/realtime/*` | Streaming event schemas are versioned with the API family that serves them; consumers must tolerate additive event fields and preserve handling of existing event types. |

For the full path/method/schema inventory, use the generated OpenAPI document at `/api/v1/openapi.json` or the interactive `/api/docs`. This matrix is a compatibility summary, not a substitute for operation-level documentation.

## No Breaking Changes Within a Version

Within a major version only additive changes are allowed: new endpoints, new optional request fields, new response fields. Removing or renaming fields/endpoints, changing types, or tightening validation requires a new major version.

## Deprecation Policy

1. Mark the old version `deprecated` in the registry with a `sunset` date at least 6 months out.
2. Announce in release notes; the `Deprecation`/`Sunset`/`Link` headers signal it to clients.
3. After the sunset date, mark it `retired`; requests for it receive `406 Not Acceptable`.
