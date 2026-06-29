# A11 — Observability / Audit Forwarding (ABB)

- **Domain:** Application Architecture
- **Type:** Architecture Building Block (technology-neutral capability)
- **Reuse classification:** Enterprise-reusable

## Capability (fundamental functionality)
Emit structured, correlatable logs with secret redaction and feed them to aggregation/SIEM.

## Interfaces
- **Provided:** structured log events; request correlation id; SIEM feed
- **Required:** T8 aggregation

## Dependencies (other ABBs)
`T8` Log Aggregation / SIEM

## Standards / NFRs
SIEM-friendly JSON

## Realization
Realized in this solution by the SBB in [`sbb/SBB.md`](sbb/SBB.md).

> ABB = *what capability must exist* (product-neutral). The SBB = *how it is built here*.
