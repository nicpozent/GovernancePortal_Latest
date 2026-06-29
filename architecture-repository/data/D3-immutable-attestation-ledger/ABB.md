# D3 — Immutable Attestation Ledger (ABB)

- **Domain:** Data Architecture
- **Type:** Architecture Building Block (technology-neutral capability)
- **Reuse classification:** Enterprise-reusable

## Capability (fundamental functionality)
Persist attestations as an append-only, identity- and version-bound record; corrections are new rows.

## Interfaces
- **Provided:** append(attestation); read(query)
- **Required:** T4 with revocable mutation grants

## Dependencies (other ABBs)
`T4` Relational DBMS with privilege-based access control

## Standards / NFRs
WORM/non-repudiation; ISO A.8.15

## Realization
Realized in this solution by the SBB in [`sbb/SBB.md`](sbb/SBB.md).

> ABB = *what capability must exist* (product-neutral). The SBB = *how it is built here*.
