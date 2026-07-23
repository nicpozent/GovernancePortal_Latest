# A13 — Shared Rate-Limit Store (ABB)

- **Domain:** Application Architecture
- **Type:** Architecture Building Block (technology-neutral capability)
- **Reuse classification:** Reusable pattern

## Capability (fundamental functionality)
Enforce request throttling with a store that can be shared across replicas for multi-instance correctness.

## Interfaces
- **Provided:** fixed-window request counters per route
- **Required:** A3 edge; an optional shared cache

## Dependencies (other ABBs)
`A3` Edge / API Gateway

## Standards / NFRs
Abuse protection

## Realization
Realized in this solution by the SBB in [`sbb/SBB.md`](sbb/SBB.md).

> ABB = *what capability must exist* (product-neutral). The SBB = *how it is built here*.
