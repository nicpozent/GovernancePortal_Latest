# SBB — quiz_attempts table

_Solution Building Block realizing ABB **D5 Assessment Results Store** in the Birgma Governance Portal._

## Realization
Append-only (UPDATE/DELETE revoked); stores answers as JSONB for per-question analytics.

## Where it lives (code)
`apps/api/db/migration_011_quizzes.sql`

## Maturity
Production-grade
