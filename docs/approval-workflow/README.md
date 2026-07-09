# Policy Approval Workflow — Documentation Package

_Complete design, requirements, and assurance documentation for the policy
approval workflow (**ADR-120**), Phases 1 → 2d. This package is the single entry
point; each document below stands on its own and cross-links the others._

> **Scope.** The pre-publication sign-off workflow: routing a policy through an
> ordered chain of approver **steps** (people and/or directory groups, with
> all/any/quorum rules), gating employee visibility until Approved **and**
> Published, reusable **templates**, notifications, and an append-only decision
> ledger. It does **not** re-document the wider portal — see the platform docs
> linked in §Related.

---

## 1. Documents in this package

| # | Document | What it gives you | Audience |
|---|----------|-------------------|----------|
| 1 | [**HLD.md**](HLD.md) — High-Level Design | Context, goals/non-goals, capability decomposition, component & container views, the state machine, integration points, and NFRs | Architects, tech leads, reviewers |
| 2 | [**LLD.md**](LLD.md) — Low-Level Design | Full data model (DDL), the `ctx()` derivation algorithm, step-satisfaction maths, group expansion, run-scoping, every API endpoint (request/response/authz/errors), and the frontend component contract | Implementers, maintainers |
| 3 | [**USER-STORIES.md**](USER-STORIES.md) | Personas, detailed user stories with Gherkin acceptance criteria, and a traceability matrix (story → endpoint → test) | Product, QA, stakeholders |
| 4 | [**SECURITY-ASSESSMENT.md**](SECURITY-ASSESSMENT.md) | STRIDE threat model, RBAC matrix, abuse cases, control mapping, and residual-risk register | Security, CISO, auditors |
| 5 | [**BUILDING-BLOCKS.md**](BUILDING-BLOCKS.md) | The Architecture Building Blocks (ABBs) and Solution Building Blocks (SBBs) this feature introduces or reuses | Enterprise architects |
| 6 | [**diagrams/**](diagrams/) | Source Mermaid diagrams (state machine, sequences, ERD, run-scoping timeline). Also embedded inline in the HLD/LLD. | All |

## 2. Decision records

The authoritative decision record is **ADR-120** in
[`../ARCHITECTURE-AND-DECISIONS.md`](../ARCHITECTURE-AND-DECISIONS.md). This
package elaborates it; it does not supersede it. The phase-level sub-decisions —
each an application of the same principle — are:

| Ref | Decision | Rationale (short) | Where realized |
|-----|----------|-------------------|----------------|
| ADR-120 | Add a per-policy, per-version approval workflow with an append-only ledger and a publish gate | Make the portal the system of record for sign-off; reuse identity/audit/notification | migrations 019–022 |
| 120-a | **Run-scope by submit time** — a "run" is decisions with `decided_at ≥ submitted_at` | A changes-requested → resubmit cycle restarts the chain cleanly without deleting evidence | `ctx()` run filter |
| 120-b | **Templates apply by copy-in**, not by reference | The policy holds its own snapshot; editing a template never disturbs a configured/in-flight policy — run isolation with no parallel run-snapshot subsystem | `apply-workflow` |
| 120-c | **Group approvers resolve at submit (snapshot-at-submit)** | Membership changes mid-review never shift an in-flight run; the ledger stays meaningful | `expandGroups()` |
| 120-d | **No owner/submitter auto-exclusion; membership is never live-dynamic** | Configuring a group == naming those people; a frozen roster is auditable | documented non-goals |

## 3. Feature status

**Implemented and merged:** Phase 1 (MVP), Phase 2a (notifications + My
approvals), Phase 2b (all/any/quorum group steps), Phase 2c (reusable templates),
Phase 2d (directory-group approvers). See the "Shipped" note in
[`../POLICY-APPROVAL-WORKFLOW.md`](../POLICY-APPROVAL-WORKFLOW.md).

## 4. Related platform documentation

- [`../POLICY-APPROVAL-WORKFLOW.md`](../POLICY-APPROVAL-WORKFLOW.md) — the original design/ADR companion and shipped-status log
- [`../ARCHITECTURE-AND-DECISIONS.md`](../ARCHITECTURE-AND-DECISIONS.md) — all ADRs (ADR-120 is this feature)
- [`../ARCHITECTURE-BUILDING-BLOCKS.md`](../ARCHITECTURE-BUILDING-BLOCKS.md) — platform-wide ABBs/SBBs
- [`../SECURITY-REVIEW.md`](../SECURITY-REVIEW.md) / [`../SECURITY-FRAMEWORKS.md`](../SECURITY-FRAMEWORKS.md) — platform security posture & controls-as-code
- [`../DATABASE-MIGRATIONS.md`](../DATABASE-MIGRATIONS.md) — migration runner & ordering
- [`../TROUBLESHOOTING.md`](../TROUBLESHOOTING.md) — error-code catalogue (approval codes included)
