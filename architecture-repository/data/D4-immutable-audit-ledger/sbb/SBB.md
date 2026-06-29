# SBB — audit_log table

_Solution Building Block realizing ABB **D4 Immutable Audit Ledger** in the Birgma Governance Portal._

## Realization
UPDATE/DELETE revoked from the app role; JSONB detail; indexed by time.

## Where it lives (code)
`apps/api/db/migration_006_audit.sql, docker-grants.sql`

## Maturity
Production-grade
