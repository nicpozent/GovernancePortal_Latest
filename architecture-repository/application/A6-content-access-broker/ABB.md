# A6 — Content Access Broker (ABB)

- **Domain:** Application Architecture
- **Type:** Architecture Building Block (technology-neutral capability)
- **Reuse classification:** Reusable pattern

## Capability (fundamental functionality)
Mediate authorised access to documents held in an external DMS, keeping the DMS the source of record.

## Interfaces
- **Provided:** resolve document metadata + short-lived download URL; browse libraries
- **Required:** T6 DMS; A2 authZ

## Dependencies (other ABBs)
`T6` Directory & Collaboration Platform, `A2` Policy Decision Point (Authorization)

## Standards / NFRs
Least privilege (Sites.Selected)

## Realization
Realized in this solution by the SBB in [`sbb/SBB.md`](sbb/SBB.md).

> ABB = *what capability must exist* (product-neutral). The SBB = *how it is built here*.
