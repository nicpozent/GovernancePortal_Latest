# D8 — Immutable Approval Decision Ledger (ABB)

- **Domain:** Data Architecture
- **Type:** Architecture Building Block (technology-neutral capability)
- **Reuse classification:** Enterprise-reusable

## Capability (fundamental functionality)
Persist approval decisions append-only, bound to the document version and the step decided.

## Interfaces
- **Provided:** append(decision); read the decision history for a version
- **Required:** T4 with revocable mutation grants

## Dependencies (other ABBs)
`T4` Relational DBMS with privilege-based access control

## Standards / NFRs
Non-repudiation; ISO 27001 A.8.15

## Realization
Realized in this solution by the SBB in [`sbb/SBB.md`](sbb/SBB.md).

> ABB = *what capability must exist* (product-neutral). The SBB = *how it is built here*.
