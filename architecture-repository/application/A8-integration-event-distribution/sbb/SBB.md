# SBB — logger.forwardEvent + /feed/audit

_Solution Building Block realizing ABB **A8 Integration / Event Distribution** in the Birgma Governance Portal._

## Realization
Fire-and-forget webhook with SSRF guard; API-key pull feed with constant-time compare + own rate limit.

## Where it lives (code)
`apps/api/src/logger.js, apps/api/src/app.js (/feed/audit)`

## Maturity
Basic (no delivery guarantees/retry/DLQ)
