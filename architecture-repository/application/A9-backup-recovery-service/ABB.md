# A9 — Backup & Recovery Service (ABB)

- **Domain:** Application Architecture
- **Type:** Architecture Building Block (technology-neutral capability)
- **Reuse classification:** Enterprise-reusable

## Capability (fundamental functionality)
Produce recoverable datastore backups on a schedule and on demand, with retention and a tested restore path.

## Interfaces
- **Provided:** scheduled + manual backup; list/download; restore
- **Required:** T4 datastore; T5 storage

## Dependencies (other ABBs)
`T4` Relational DBMS with privilege-based access control, `T5` Object / File Storage, `A10` Scheduling / Task Orchestration

## Standards / NFRs
ISO A.8.13 (backup)

## Realization
Realized in this solution by the SBB in [`sbb/SBB.md`](sbb/SBB.md).

> ABB = *what capability must exist* (product-neutral). The SBB = *how it is built here*.
