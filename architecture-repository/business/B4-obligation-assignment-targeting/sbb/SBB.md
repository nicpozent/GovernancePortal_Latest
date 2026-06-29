# SBB — groups + policy_groups + effective_group_membership view

_Solution Building Block realizing ABB **B4 Obligation Assignment & Targeting** in the Birgma Governance Portal._

## Realization
Effective membership = direct group membership ∪ directory groups mapped into a group; unassigned ⇒ private.

## Where it lives (code)
`apps/api/db/migration_018_effective_membership.sql, routes.js`

## Maturity
Production-grade (membership consolidated into one view)
