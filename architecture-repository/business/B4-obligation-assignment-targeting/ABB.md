# B4 — Obligation Assignment & Targeting (ABB)

- **Domain:** Business Architecture
- **Type:** Architecture Building Block (technology-neutral capability)
- **Reuse classification:** Reusable pattern

## Capability (fundamental functionality)
Express which population must fulfil which obligation, via groups and effective membership.

## Interfaces
- **Provided:** assign a document to groups; resolve who an obligation applies to
- **Required:** D1 identity/groups; the effective-membership rollup

## Dependencies (other ABBs)
`D1` Identity & Organisation Master Data, `D2` Obligation Catalogue

## Standards / NFRs
RBAC/ABAC targeting

## Realization
Realized in this solution by the SBB in [`sbb/SBB.md`](sbb/SBB.md).

> ABB = *what capability must exist* (product-neutral). The SBB = *how it is built here*.
