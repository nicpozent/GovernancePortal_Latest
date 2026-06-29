# A8 — Integration / Event Distribution (ABB)

- **Domain:** Application Architecture
- **Type:** Architecture Building Block (technology-neutral capability)
- **Reuse classification:** Reusable pattern

## Capability (fundamental functionality)
Distribute domain events to external systems via push (webhook) and pull (authenticated feed).

## Interfaces
- **Provided:** forward(event); GET /feed/audit
- **Required:** A11 events; D4 ledger

## Dependencies (other ABBs)
`A11` Observability / Audit Forwarding, `D4` Immutable Audit Ledger

## Standards / NFRs
—

## Realization
Realized in this solution by the SBB in [`sbb/SBB.md`](sbb/SBB.md).

> ABB = *what capability must exist* (product-neutral). The SBB = *how it is built here*.
