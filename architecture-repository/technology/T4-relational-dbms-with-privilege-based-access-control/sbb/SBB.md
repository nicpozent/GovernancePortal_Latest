# SBB — PostgreSQL 16

_Solution Building Block realizing ABB **T4 Relational DBMS with privilege-based access control** in the Birgma Governance Portal._

## Realization
Non-owner app role; append-only ledgers via REVOKE; advisory locks for race-safe writes; CTEs/JSONB for reporting.

## Where it lives (code)
`apps/api/db/*, apps/api/src/db.js`

## Maturity
Production-grade

## Alternative SBBs that could realize this ABB
SQL Server, MySQL (with equivalent grant model).
