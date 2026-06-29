# A10 — Scheduling / Task Orchestration (ABB)

- **Domain:** Application Architecture
- **Type:** Architecture Building Block (technology-neutral capability)
- **Reuse classification:** Reusable pattern

## Capability (fundamental functionality)
Run recurring background jobs (backup, sync, reminders) on a schedule.

## Interfaces
- **Provided:** periodic invocation of jobs
- **Required:** a runtime that stays resident

## Dependencies (other ABBs)
`T3` Application Runtime / Container Platform

## Standards / NFRs
—

## Realization
Realized in this solution by the SBB in [`sbb/SBB.md`](sbb/SBB.md).

> ABB = *what capability must exist* (product-neutral). The SBB = *how it is built here*.
