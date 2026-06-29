# A2 — Policy Decision Point (Authorization) (ABB)

- **Domain:** Application Architecture
- **Type:** Architecture Building Block (technology-neutral capability)
- **Reuse classification:** Enterprise-reusable

## Capability (fundamental functionality)
Decide permit/deny from role + ownership + attribute (effective membership). Default deny.

## Interfaces
- **Provided:** can(principal,action,resource)
- **Required:** A1 principal; D1/D2 data

## Dependencies (other ABBs)
`A1` Identity Federation / Token Validation, `D1` Identity & Organisation Master Data, `D2` Obligation Catalogue

## Standards / NFRs
RBAC (NIST), ABAC/XACML PEP-PDP separation

## Realization
Realized in this solution by the SBB in [`sbb/SBB.md`](sbb/SBB.md).

> ABB = *what capability must exist* (product-neutral). The SBB = *how it is built here*.
