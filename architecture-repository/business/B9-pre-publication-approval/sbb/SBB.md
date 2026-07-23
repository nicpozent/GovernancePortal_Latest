# SBB — policy_approval_steps/approvers/approver_groups + approval_workflows templates

_Solution Building Block realizing ABB **B9 Pre-publication Approval** in the Birgma Governance Portal._

## Realization
Ordered steps with all/any/quorum satisfaction; group approvers expanded and frozen at submit; publish gated on Approved; decisions append-only. Detailed as AW-1..AW-7 in the approval-workflow package.

## Where it lives (code)
`apps/api/src/routes/approvals.js, apps/api/src/routes/approval-templates.js, db/migration_019..022`

## Maturity
Production-grade

## Alternative SBBs that could realize this ABB
External BPM/workflow engine (e.g. Camunda) or a SaaS approval service.
