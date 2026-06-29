# D4 — Immutable Audit Ledger (ABB)

- **Domain:** Data Architecture
- **Type:** Architecture Building Block (technology-neutral capability)
- **Reuse classification:** Enterprise-reusable

## Capability (fundamental functionality)
Append-only event-of-record for administrative actions.

## Interfaces
- **Provided:** append(event); read(query); forward
- **Required:** T4 with revocable mutation grants

## Dependencies (other ABBs)
`T4` Relational DBMS with privilege-based access control

## Standards / NFRs
ISO A.8.15

## Realization
Realized in this solution by the SBB in [`sbb/SBB.md`](sbb/SBB.md).

> ABB = *what capability must exist* (product-neutral). The SBB = *how it is built here*.
