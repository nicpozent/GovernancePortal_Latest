# SBB — requireManager + canManage + teamOids

_Solution Building Block realizing ABB **B5 Delegated Management (Organisational Scope)** in the Birgma Governance Portal._

## Realization
Team = functional-manager reports ∪ directory-manager-email match; ownership = policies.owner_oid.

## Where it lives (code)
`apps/api/src/routes.js (teamOids, canManage, /manager/*)`

## Maturity
Production-grade
