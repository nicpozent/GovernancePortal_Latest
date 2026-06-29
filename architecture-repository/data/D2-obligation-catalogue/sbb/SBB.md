# SBB — policies, policy_groups, policy_versions

_Solution Building Block realizing ABB **D2 Obligation Catalogue** in the Birgma Governance Portal._

## Realization
One polymorphic table for admin policies and manager uploads (doc_type/source discriminators).

## Where it lives (code)
`apps/api/db/schema.sql, migration_016_trainings.sql`

## Maturity
Production-grade
