# OpenAPI example validation

CI runs `npm run openapi:check-examples` against the same `swaggerSpec` object served by `/api/v1/openapi.json`. The check validates inline schema examples, parameter examples, and request/response media-type examples against their declared schemas, including local `#/components/schemas/...` references. It performs no live HTTP calls and does not depend on a particular Stellar network or database.

When an example fails, the check exits non-zero and reports its operation/schema location and validation error. Keep examples representative of the declared request/response shape; update a schema or example when the API contract intentionally changes. Run `npm run openapi:check-examples` locally before submitting OpenAPI annotation changes.

The CI check runs in the SDK job before generated-client drift checks. It requires no rollout action. The validator is a development dependency only and does not affect runtime API behavior.
