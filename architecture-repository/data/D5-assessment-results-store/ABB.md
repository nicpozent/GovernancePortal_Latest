# D5 — Assessment Results Store (ABB)

- **Domain:** Data Architecture
- **Type:** Architecture Building Block (technology-neutral capability)
- **Reuse classification:** Reusable pattern

## Capability (fundamental functionality)
Record assessment attempts and scores immutably.

## Interfaces
- **Provided:** append(attempt); read attempts/analytics
- **Required:** T4

## Dependencies (other ABBs)
`T4` Relational DBMS with privilege-based access control

## Standards / NFRs
—

## Realization
Realized in this solution by the SBB in [`sbb/SBB.md`](sbb/SBB.md).

> ABB = *what capability must exist* (product-neutral). The SBB = *how it is built here*.
