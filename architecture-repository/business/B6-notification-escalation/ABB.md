# B6 — Notification & Escalation (ABB)

- **Domain:** Business Architecture
- **Type:** Architecture Building Block (technology-neutral capability)
- **Reuse classification:** Enterprise-reusable

## Capability (fundamental functionality)
Drive people to fulfil obligations through scheduled, escalating reminders.

## Interfaces
- **Provided:** send due/overdue reminders on a milestone ladder; review reminders to owners
- **Required:** A7 messaging; D6 idempotency state

## Dependencies (other ABBs)
`A7` Outbound Notification Service, `D6` Notification State Store, `A10` Scheduling / Task Orchestration

## Standards / NFRs
—

## Realization
Realized in this solution by the SBB in [`sbb/SBB.md`](sbb/SBB.md).

> ABB = *what capability must exist* (product-neutral). The SBB = *how it is built here*.
