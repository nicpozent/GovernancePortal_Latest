# B1 — Policy Lifecycle Management (ABB)

- **Domain:** Business Architecture
- **Type:** Architecture Building Block (technology-neutral capability)
- **Reuse classification:** Reusable pattern

## Capability (fundamental functionality)
Author, version, assign, review and retire governance documents through a controlled lifecycle.

## Interfaces
- **Provided:** create/update/version/archive a governed document; resolve its current authoritative version
- **Required:** D2 Obligation Catalogue; B4 targeting; a document source of record

## Dependencies (other ABBs)
`D2` Obligation Catalogue, `B4` Obligation Assignment & Targeting, `A6` Content Access Broker

## Standards / NFRs
ISO 27001 A.5.1 (policies)

## Realization
Realized in this solution by the SBB in [`sbb/SBB.md`](sbb/SBB.md).

> ABB = *what capability must exist* (product-neutral). The SBB = *how it is built here*.
