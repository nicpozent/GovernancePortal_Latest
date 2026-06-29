# SBB — policies + policy_versions tables; SharePoint as document source

_Solution Building Block realizing ABB **B1 Policy Lifecycle Management** in the Birgma Governance Portal._

## Realization
CRUD + archive endpoints; version label mirrored from SharePoint; soft-delete keeps the ledger intact.

## Where it lives (code)
`apps/api/src/routes.js (/policies*), db/schema.sql, services/sharepoint.js`

## Maturity
Production-grade

## Alternative SBBs that could realize this ABB
Any DMS/CMS with versioning could source documents.
