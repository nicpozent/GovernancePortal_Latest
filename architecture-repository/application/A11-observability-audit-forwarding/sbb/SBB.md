# SBB — pino + pino-http

_Solution Building Block realizing ABB **A11 Observability / Audit Forwarding** in the Birgma Governance Portal._

## Realization
JSON to stdout; auth/secret fields redacted; per-request x-request-id echoed on errors.

## Where it lives (code)
`apps/api/src/logger.js, server.js`

## Maturity
Production-grade (aggregation is a deployment concern)
