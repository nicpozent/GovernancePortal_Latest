# B8 — Accountability / Non-repudiation (ABB)

- **Domain:** Business Architecture
- **Type:** Architecture Building Block (technology-neutral capability)
- **Reuse classification:** Enterprise-reusable

## Capability (fundamental functionality)
Maintain a defensible record of who did what, when.

## Interfaces
- **Provided:** append admin-action events; read the audit trail / forward it
- **Required:** D4 audit ledger; A1 identity

## Dependencies (other ABBs)
`D4` Immutable Audit Ledger, `A1` Identity Federation / Token Validation

## Standards / NFRs
ISO A.8.15 (logging)

## Realization
Realized in this solution by the SBB in [`sbb/SBB.md`](sbb/SBB.md).

> ABB = *what capability must exist* (product-neutral). The SBB = *how it is built here*.
