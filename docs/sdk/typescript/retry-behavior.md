# Safe retry behavior for the TypeScript SDK

`SorobanClient` sends one attempt by default and performs up to `maxRetries`
additional attempts (default `2`). `timeoutMs` applies to each attempt.
Automatic waits honor `Retry-After` (delta-seconds or HTTP date) and are capped
by `maxRetryDelayMs` (default `30_000` ms); without that header, the SDK uses
exponential backoff with jitter.

| Request                                   | Automatically retried                                                 |
| ----------------------------------------- | --------------------------------------------------------------------- |
| `GET`, `HEAD`, `PUT`, `DELETE`, `OPTIONS` | Network errors, per-attempt timeouts, HTTP `429`, `502`, `503`, `504` |
| `POST`, `PATCH`                           | HTTP `429` only                                                       |
| Any method                                | Other statuses, including `500`, are not retried                      |

The SDK assumes an HTTP `429` means the server rejected the attempt before
performing its side effect. The client retries that response for all methods,
including `POST` and `PATCH`; only rely on this behavior where the API's rate
limiter enforces that guarantee. A network error or timeout during a
non-idempotent request is **not** automatically retried, but the server may
still have received and processed it. Do not blindly replay such a request;
first reconcile its outcome with the API, and use an API-supported idempotency
mechanism if one is available.

Set `maxRetries: 0` to disable automatic retries. For retry observability,
`onRequest` reports each attempt and its `willRetry` decision. This policy does
not select or fail over between Stellar networks: configure `baseUrl` for the
intended mainnet, testnet, or devnet API deployment.

The retry policy has no effect on API response shapes or generated method
signatures and can be rolled back by setting `maxRetries: 0`.
