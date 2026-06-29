# SBB — requireAdmin/requireManager + canRead/canManage

_Solution Building Block realizing ABB **A2 Policy Decision Point (Authorization)** in the Birgma Governance Portal._

## Realization
Recomputed every request; private-by-default; membership now resolved through one shared view (M-1 fix).

## Where it lives (code)
`apps/api/src/auth.js, routes.js (canRead/canManage)`

## Maturity
Production-grade (consolidated; previously embedded/duplicated)
