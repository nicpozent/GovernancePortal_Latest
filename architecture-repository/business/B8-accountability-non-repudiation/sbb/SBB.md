# SBB — audit_log (append-only) + audit() helper

_Solution Building Block realizing ABB **B8 Accountability / Non-repudiation** in the Birgma Governance Portal._

## Realization
Every admin mutation writes an immutable, identity+IP-stamped row; best-effort, never blocks the request.

## Where it lives (code)
`apps/api/src/routes.js (audit()), db/migration_006_audit.sql`

## Maturity
Production-grade
