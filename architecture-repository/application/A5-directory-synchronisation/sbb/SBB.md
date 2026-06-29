# SBB — services/sync.js (Graph) + SCIM endpoint option

_Solution Building Block realizing ABB **A5 Directory Synchronisation** in the Birgma Governance Portal._

## Realization
Reads only app-assigned principals; deactivates leavers (never deletes); auditable via sync_runs.

## Where it lives (code)
`apps/api/src/services/sync.js, scim/scim.routes.js`

## Maturity
Production-grade
