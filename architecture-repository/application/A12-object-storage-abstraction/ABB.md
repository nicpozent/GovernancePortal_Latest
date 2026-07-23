# A12 — Object Storage Abstraction (ABB)

- **Domain:** Application Architecture
- **Type:** Architecture Building Block (technology-neutral capability)
- **Reuse classification:** Reusable pattern

## Capability (fundamental functionality)
Abstract file persistence behind a driver so local disk or cloud object storage are interchangeable without re-architecture.

## Interfaces
- **Provided:** put/get/delete a file via a driver interface
- **Required:** T5 storage

## Dependencies (other ABBs)
`T5` Object / File Storage

## Standards / NFRs
Server-determined content type + nosniff

## Realization
Realized in this solution by the SBB in [`sbb/SBB.md`](sbb/SBB.md).

> ABB = *what capability must exist* (product-neutral). The SBB = *how it is built here*.
