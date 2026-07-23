# B9 — Pre-publication Approval (ABB)

- **Domain:** Business Architecture
- **Type:** Architecture Building Block (technology-neutral capability)
- **Reuse classification:** Enterprise-reusable

## Capability (fundamental functionality)
Route a governed document through an ordered, multi-party sign-off before it becomes visible to its audience.

## Interfaces
- **Provided:** configure approval steps/approvers; submit/withdraw; approve/reject/request-changes; publish; pending queue
- **Required:** A2 PDP; D8 approval ledger; B1 lifecycle

## Dependencies (other ABBs)
`A2` Policy Decision Point (Authorization), `D8` Immutable Approval Decision Ledger, `B1` Policy Lifecycle Management

## Standards / NFRs
Segregation of duties; ISO 27001 A.5.4

## Realization
Realized in this solution by the SBB in [`sbb/SBB.md`](sbb/SBB.md).

> ABB = *what capability must exist* (product-neutral). The SBB = *how it is built here*.
