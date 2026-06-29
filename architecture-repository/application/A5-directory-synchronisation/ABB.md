# A5 — Directory Synchronisation (ABB)

- **Domain:** Application Architecture
- **Type:** Architecture Building Block (technology-neutral capability)
- **Reuse classification:** Enterprise-reusable

## Capability (fundamental functionality)
Reconcile in-scope external identities/groups into the local master, least-privilege; handle joiners/movers/leavers.

## Interfaces
- **Provided:** sync() → {added,updated,deactivated}; status
- **Required:** T6 directory (read) or SCIM push

## Dependencies (other ABBs)
`T6` Directory & Collaboration Platform, `D1` Identity & Organisation Master Data

## Standards / NFRs
SCIM 2.0; least privilege

## Realization
Realized in this solution by the SBB in [`sbb/SBB.md`](sbb/SBB.md).

> ABB = *what capability must exist* (product-neutral). The SBB = *how it is built here*.
