# SBB — gdpr.js (DSAR / erasure / retention)

_Solution Building Block realizing ABB **B10 Data-Subject Rights (GDPR)** in the Birgma Governance Portal._

## Realization
Exports a full per-subject package; erasure pseudonymizes/redacts rather than deleting ledger rows; retention purge past a configurable window.

## Where it lives (code)
`apps/api/src/gdpr.js, apps/api/db/gdpr.js (CLI), apps/api/src/routes/admin.js`

## Maturity
Production-grade (DPO adoption pending)
