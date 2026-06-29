# T4 — Relational DBMS with privilege-based access control (ABB)

- **Domain:** Technology Architecture
- **Type:** Architecture Building Block (technology-neutral capability)
- **Reuse classification:** Reusable pattern

## Capability (fundamental functionality)
Persist relational data and enforce integrity, with a privilege model that can revoke mutation.

## Interfaces
- **Provided:** SQL, transactions, views, role-based grants, advisory locks
- **Required:** —

## Dependencies (other ABBs)
—

## Standards / NFRs
SQL; ACID

## Realization
Realized in this solution by the SBB in [`sbb/SBB.md`](sbb/SBB.md).

> ABB = *what capability must exist* (product-neutral). The SBB = *how it is built here*.
