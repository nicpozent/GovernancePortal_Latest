# SBB — auth.js over jsonwebtoken + jwks-rsa

_Solution Building Block realizing ABB **A1 Identity Federation / Token Validation** in the Birgma Governance Portal._

## Realization
RS256 pinned; tenant pinned; app-only tokens rejected; identity from claims only; JWKS cached.

## Where it lives (code)
`apps/api/src/auth.js`

## Maturity
Production-grade

## Alternative SBBs that could realize this ABB
Entra/Okta/Auth0 as IdP; express-oauth2-jwt-bearer or a gateway as validator.
