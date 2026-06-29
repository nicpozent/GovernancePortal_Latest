# A4 — Presentation / Experience (ABB)

- **Domain:** Application Architecture
- **Type:** Architecture Building Block (technology-neutral capability)
- **Reuse classification:** Reusable pattern

## Capability (fundamental functionality)
Authenticated single-page client for the governance workflows.

## Interfaces
- **Provided:** sign-in, browse, sign, quiz, admin/manager screens
- **Required:** A1/T1 for sign-in; the API

## Dependencies (other ABBs)
`T1` Identity Provider (OIDC/OAuth2), `A3` Edge / API Gateway

## Standards / NFRs
OIDC PKCE

## Realization
Realized in this solution by the SBB in [`sbb/SBB.md`](sbb/SBB.md).

> ABB = *what capability must exist* (product-neutral). The SBB = *how it is built here*.
