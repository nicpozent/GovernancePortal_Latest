# A3 — Edge / API Gateway (ABB)

- **Domain:** Application Architecture
- **Type:** Architecture Building Block (technology-neutral capability)
- **Reuse classification:** Enterprise-reusable

## Capability (fundamental functionality)
Terminate TLS, apply security headers/CSP, present a same-origin surface, and rate-limit.

## Interfaces
- **Provided:** TLS, header/CSP enforcement, reverse proxy, throttling
- **Required:** T2 HTTP edge

## Dependencies (other ABBs)
`T2` HTTP Edge / TLS Termination

## Standards / NFRs
OWASP secure headers; CSP Level 2

## Realization
Realized in this solution by the SBB in [`sbb/SBB.md`](sbb/SBB.md).

> ABB = *what capability must exist* (product-neutral). The SBB = *how it is built here*.
