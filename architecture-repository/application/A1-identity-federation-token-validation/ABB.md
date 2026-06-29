# A1 — Identity Federation / Token Validation (ABB)

- **Domain:** Application Architecture
- **Type:** Architecture Building Block (technology-neutral capability)
- **Reuse classification:** Enterprise-reusable

## Capability (fundamental functionality)
Validate a federated access token (signature, issuer, audience, tenant, token-type, scope) and expose verified identity.

## Interfaces
- **Provided:** authenticate(request) → Principal{subject,name,roles,scopes}
- **Required:** T1 IdP discovery/JWKS

## Dependencies (other ABBs)
`T1` Identity Provider (OIDC/OAuth2)

## Standards / NFRs
OAuth 2.0, OIDC, JWT (RFC 7519), JWKS (RFC 7517)

## Realization
Realized in this solution by the SBB in [`sbb/SBB.md`](sbb/SBB.md).

> ABB = *what capability must exist* (product-neutral). The SBB = *how it is built here*.
