# API authorization and rate-limit tiers

API keys are resolved by the global `apiKeyAuth` middleware before rate limiting. A valid key's stored tier controls authorization and rate limits; requests without a key are public and receive the unauthenticated rate limit. Invalid, expired, or revoked keys receive `401` and do not continue to the route or rate limiter.

## Tier matrix

| Caller           | `requireApiKey` | Minimum-tier gate                                       |          Default requests/minute |
| ---------------- | --------------- | ------------------------------------------------------- | -------------------------------: |
| No API key       | `401`           | Treated as `unauthenticated`; denied for every key tier |                               60 |
| `free` key       | Allowed         | `free` only                                             |    `RATE_LIMIT_PUBLIC_MAX` (100) |
| `developer` key  | Allowed         | `free` and `developer`                                  | `RATE_LIMIT_DEVELOPER_MAX` (300) |
| `pro` key        | Allowed         | `free`, `developer`, and `pro`                          |  `RATE_LIMIT_PREMIUM_MAX` (1000) |
| `enterprise` key | Allowed         | All minimum tiers                                       |  `RATE_LIMIT_PREMIUM_MAX` (1000) |

The environment variables' listed defaults apply when they are unset. The `free`, `developer`, `pro`, and `enterprise` rates are configurable by deployment; enterprise custom organization limits are handled separately by `applyEnterpriseRateLimit` when that middleware is mounted. The Redis token-bucket and local in-memory implementations use the same configured per-minute limits. The unauthenticated policy is fixed at 60 requests/minute. Rate limits are enforced per API key (or client IP for unauthenticated traffic), with stricter endpoint multipliers where configured.

`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, and `X-RateLimit-Tier` describe the effective policy; `Retry-After` is included on `429` responses. A `403` indicates a valid key that lacks the required tier or a key restriction, while `401` indicates missing/invalid credentials for a protected route.

## Rollout and compatibility

No schema or key migration is required. Existing rate variables retain their values and defaults. Anonymous traffic is now consistently subject to the documented 60 requests/minute limit even when Redis is not configured; clients that exceed it should authenticate with a valid API key. Configure `RATE_LIMIT_PUBLIC_MAX`, `RATE_LIMIT_DEVELOPER_MAX`, and `RATE_LIMIT_PREMIUM_MAX` consistently across instances before rolling out, since each process reads these values at startup.
