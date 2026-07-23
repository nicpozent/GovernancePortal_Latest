# SBB — pino + pino-http + prom-client

_Solution Building Block realizing ABB **A11 Observability / Audit Forwarding** in the Birgma Governance Portal._

## Realization
JSON to stdout; auth/secret fields redacted; per-request x-request-id echoed on errors; RED metrics on /metrics and a DB-checked /readyz.

## Where it lives (code)
`apps/api/src/logger.js, apps/api/src/metrics.js, apps/api/src/app.js (/metrics, /readyz)`

## Maturity
Production-grade (aggregation is a deployment concern)
