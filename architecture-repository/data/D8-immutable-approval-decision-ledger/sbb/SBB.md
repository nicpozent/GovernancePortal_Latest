# SBB — policy_approvals table

_Solution Building Block realizing ABB **D8 Immutable Approval Decision Ledger** in the Birgma Governance Portal._

## Realization
UPDATE/DELETE revoked from the app role; each row records version, step, approver, decision, comment and time.

## Where it lives (code)
`apps/api/db/migration_019_approvals.sql, docker-grants.sql`

## Maturity
Production-grade
