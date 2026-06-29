# SBB — Microsoft Entra ID

_Solution Building Block realizing ABB **T1 Identity Provider (OIDC/OAuth2)** in the Birgma Governance Portal._

## Realization
SPA + API app registrations; app roles Governance.Admin/Manager; MFA/Conditional Access org-side.

## Where it lives (code)
`apps/web/src/app.jsx (MSAL config), apps/api/src/config.js`

## Maturity
Enterprise-shared

## Alternative SBBs that could realize this ABB
Okta, Auth0, Keycloak.
