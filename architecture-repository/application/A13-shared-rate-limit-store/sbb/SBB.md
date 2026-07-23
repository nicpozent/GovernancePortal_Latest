# SBB — ratelimit.js (in-memory default; Redis via RATE_LIMIT_REDIS_URL)

_Solution Building Block realizing ABB **A13 Shared Rate-Limit Store** in the Birgma Governance Portal._

## Realization
Pluggable store; per-route limiters (/api, /api/sync, /feed); a shared Redis store keeps limits correct across instances (ADR-119).

## Where it lives (code)
`apps/api/src/ratelimit.js, apps/api/src/app.js`

## Maturity
Production-grade (in-memory default; Redis optional)
