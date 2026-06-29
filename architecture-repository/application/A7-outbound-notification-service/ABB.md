# A7 — Outbound Notification Service (ABB)

- **Domain:** Application Architecture
- **Type:** Architecture Building Block (technology-neutral capability)
- **Reuse classification:** Enterprise-reusable

## Capability (fundamental functionality)
Send transactional messages via an enterprise messaging platform.

## Interfaces
- **Provided:** sendMail(to,subject,html)
- **Required:** T6 messaging platform

## Dependencies (other ABBs)
`T6` Directory & Collaboration Platform

## Standards / NFRs
—

## Realization
Realized in this solution by the SBB in [`sbb/SBB.md`](sbb/SBB.md).

> ABB = *what capability must exist* (product-neutral). The SBB = *how it is built here*.
