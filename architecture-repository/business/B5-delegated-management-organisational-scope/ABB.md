# B5 — Delegated Management (Organisational Scope) (ABB)

- **Domain:** Business Architecture
- **Type:** Architecture Building Block (technology-neutral capability)
- **Reuse classification:** Reusable pattern

## Capability (fundamental functionality)
Let managers act only on their own content and their own team.

## Interfaces
- **Provided:** scope reads/writes to a manager's team and owned items
- **Required:** A2 PDP; D1 manager graph

## Dependencies (other ABBs)
`A2` Policy Decision Point (Authorization), `D1` Identity & Organisation Master Data

## Standards / NFRs
Least privilege (ISO A.8.2)

## Realization
Realized in this solution by the SBB in [`sbb/SBB.md`](sbb/SBB.md).

> ABB = *what capability must exist* (product-neutral). The SBB = *how it is built here*.
