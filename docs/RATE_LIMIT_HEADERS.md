# Rate Limit Headers

Rate limits are enforced per access tier, and the effective values are returned
as response headers on responses handled by the rate-limit middleware. The
policy depends on whether the Redis token bucket is active and may be further
reduced for expensive endpoints or changed by an enterprise override. Use the
response headers as the source of truth for an individual request.

## Standard Headers

### X-RateLimit-Limit

Effective request limit for this endpoint and rate-limit window.

```
X-RateLimit-Limit: 100
```

### X-RateLimit-Remaining

Requests currently remaining in the active window or token bucket.

```
X-RateLimit-Remaining: 87
```

### X-RateLimit-Reset

Unix timestamp in seconds when the current window or bucket is expected to
reset.

```
X-RateLimit-Reset: 1722282947
```

### X-RateLimit-Tier

The API tier applied to this request. Indicates which rate limit configuration was used.

```
X-RateLimit-Tier: free
```

The legacy in-memory limiter reports `free`, `developer`, `premium`, or
`enterprise`. The Redis token-bucket limiter reports `free`, `developer`,
`pro` (the premium access tier), or `enterprise`. Enterprise custom policies
report `enterprise-custom`.

### Retry-After (429 only)

Seconds to wait before retrying. On a 429 response, prefer this value over
calculating a delay from `X-RateLimit-Reset`.

```
Retry-After: 60
```

## Optional Headers

### X-RateLimit-Policy

Present when a custom policy applies, such as `user-override` or an
enterprise-custom policy label.

```
X-RateLimit-Policy: user-override
```

## Example Usage

### JavaScript/Node.js

```typescript
import axios from 'axios';

const client = axios.create({
  baseURL: 'https://api.example.com',
  headers: { 'X-API-Key': 'your-api-key' },
});

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 429) {
      const retryAfter = parseInt(
        error.response.headers['retry-after'] ||
          Math.ceil(error.response.headers['x-ratelimit-reset'] - Date.now() / 1000),
      );

      console.log(`Rate limited. Retrying after ${retryAfter} seconds...`);
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));

      return client.request(error.config);
    }
    return Promise.reject(error);
  },
);

// Make requests with backoff support
const response = await client.get('/api/v1/transactions');
console.log(`Requests remaining: ${response.headers['x-ratelimit-remaining']}`);
```

### Python

```python
import requests
import time

class RateLimitedSession(requests.Session):
    def request(self, *args, **kwargs):
        while True:
            response = super().request(*args, **kwargs)

            if response.status_code == 429:
                retry_after = int(
                    response.headers.get('Retry-After') or
                    (int(response.headers['X-RateLimit-Reset']) - time.time())
                )
                print(f"Rate limited. Retrying after {retry_after} seconds...")
                time.sleep(retry_after)
                continue

            # Log remaining requests
            remaining = response.headers.get('X-RateLimit-Remaining')
            if remaining:
                print(f"Requests remaining: {remaining}")

            return response

session = RateLimitedSession()
response = session.get(
    'https://api.example.com/api/v1/transactions',
    headers={'X-API-Key': 'your-api-key'}
)
```

### curl

```bash
# Make a request and inspect rate limit headers
curl -i -H 'X-API-Key: your-api-key' \
  https://api.example.com/api/v1/transactions

# Response will include:
# X-RateLimit-Limit: 300
# X-RateLimit-Remaining: 234
# X-RateLimit-Reset: 1722282947
# X-RateLimit-Tier: developer
```

## Default policies

The service has two limiter configurations. A connected Redis store activates
the token-bucket policies; otherwise the in-memory limiter uses the configurable
legacy defaults.

| Access tier                   | Legacy default per minute | Redis token-bucket refill per minute | Redis burst capacity |
| ----------------------------- | ------------------------: | -----------------------------------: | -------------------: |
| Public / free                 |                       100 |                                1,000 |                   50 |
| Developer                     |                       300 |                                1,000 |                   50 |
| Premium (`pro` in Redis mode) |                     1,000 |                               10,000 |                  200 |
| Enterprise                    |                     1,000 |                               60,000 |                  500 |

Legacy defaults can be changed with `RATE_LIMIT_PUBLIC_MAX`,
`RATE_LIMIT_DEVELOPER_MAX`, and `RATE_LIMIT_PREMIUM_MAX`, and their matching
`*_WINDOW_MS` variables (defaults are 60,000 ms). The legacy enterprise
limiter uses the premium window and maximum. Redis token-bucket values are
defined in `src/middleware/tokenBucket.ts`; enterprise custom limits may
override the standard tier policy.

In Redis mode, route groups further scale the effective per-minute limit:
search uses 50%, contract-creation POST requests 17%, simulation requests 8%,
and WebSocket requests 5%. Event routes use the tier's full rate. The
`X-RateLimit-Limit` header reports the effective limit after this scaling.
An enterprise per-organisation policy or configured user override takes
precedence where its middleware is active.

Rate-limit counters are local to a backend deployment: separate network
deployments (for example, testnet and mainnet) have independent counters when
they use separate Redis stores or in-memory processes. The limit policy itself
does not select a Stellar network; network selection remains a deployment
configuration.

For browser clients, the API exposes `X-Request-Id`, the `X-RateLimit-*`
headers, and `Retry-After` through CORS. Production deployments must still
allow the browser application's origin with `CORS_ALLOWED_ORIGINS`.

## Best Practices

1. **Monitor `X-RateLimit-Remaining`**: Stop making new requests if this value is low.
2. **Pre-emptive backoff**: Implement exponential backoff before hitting the limit.
3. **Use Unix timestamps**: `X-RateLimit-Reset` is always a Unix timestamp in seconds for easy comparison with `Date.now() / 1000`.
4. **Respect Retry-After**: When receiving 429, always use the `Retry-After` header (or calculate from `X-RateLimit-Reset`).
5. **Per-tier strategies**: Premium tier requests can be made more aggressively than free tier.

## Example: Adaptive Request Rate

```typescript
async function makeRequestWithBackoff(
  client: AxiosInstance,
  endpoint: string,
  minRemaining: number = 10,
) {
  const response = await client.get(endpoint);
  const remaining = parseInt(response.headers['x-ratelimit-remaining']);
  const resetAt = parseInt(response.headers['x-ratelimit-reset']);

  if (remaining < minRemaining) {
    const waitSeconds = resetAt - Math.floor(Date.now() / 1000);
    console.log(`Low requests remaining (${remaining}). Waiting ${waitSeconds}s until reset.`);
    await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
  }

  return response;
}
```
