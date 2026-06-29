# D7 — Integration & Operations State (ABB)

- **Domain:** Data Architecture
- **Type:** Architecture Building Block (technology-neutral capability)
- **Reuse classification:** Solution-specific

## Capability (fundamental functionality)
Hold integration configuration and operational run history.

## Interfaces
- **Provided:** read/write forward+feed config; sync run history
- **Required:** T4

## Dependencies (other ABBs)
`T4` Relational DBMS with privilege-based access control

## Standards / NFRs
—

## Realization
Realized in this solution by the SBB in [`sbb/SBB.md`](sbb/SBB.md).

> ABB = *what capability must exist* (product-neutral). The SBB = *how it is built here*.
