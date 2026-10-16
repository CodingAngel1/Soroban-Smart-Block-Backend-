# Conditional requests for resource endpoints

Transaction detail (`GET /api/v1/transactions/{hash}`), event detail
(`GET /api/v1/events/{id}`), and contract detail
(`GET /api/v1/contracts/{address}`) support conditional GET requests. Successful
JSON responses carry an Express-generated `ETag`,
`Cache-Control: public, max-age=0, must-revalidate`, and `Vary: X-Network`.
Send the returned value in `If-None-Match`; an unchanged representation returns
`304 Not Modified` with no response body. A stale or absent validator returns
the normal `200` JSON representation.

The zero freshness lifetime keeps mutable indexed resources current while
allowing browsers and intermediaries to revalidate instead of downloading an
unchanged body. This is additive to the response contract. Clients that do not
send `If-None-Match` continue receiving the existing JSON response. Cache keys
must honor `Vary: X-Network` because a request can select a Stellar network via
that header; requests routed by network-specific hostnames naturally have
separate host cache keys. Deployments should ensure any shared proxy respects
both the validator and the `Vary` header.
