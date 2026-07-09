# Security Assessment — Policy Approval Workflow

_Feature-scoped threat model and control review. Complements the platform-wide
[`../SECURITY-REVIEW.md`](../SECURITY-REVIEW.md) and the controls-as-code
catalogue in [`../SECURITY-FRAMEWORKS.md`](../SECURITY-FRAMEWORKS.md). Companion:
[LLD.md](LLD.md)._

---

## 1. Assets & trust boundaries

| Asset | Why it matters | Sensitivity |
|-------|----------------|-------------|
| **Approval decisions** (`policy_approvals`) | Legal/governance evidence that a policy was authorised | High — integrity critical |
| **Approval state** (`policies.approval_state`) | Controls whether employees can see a policy | High — confidentiality + integrity |
| **Approver configuration** (steps/people/groups, templates) | Determines *who* can authorise | High — integrity |
| **Reviewer comments** | May contain sensitive rationale | Medium |

**Trust boundaries:** (a) browser ↔ API — every request carries a delegated Entra
JWT, validated by `requireAuth` (RS256, issuer/audience/tenant/scope; app-only
tokens rejected); (b) API ↔ PostgreSQL — the app connects as the least-privilege
`governance_app` role; (c) API ↔ Microsoft Graph (mail) — app-only, config-gated,
side-effect only.

---

## 2. STRIDE analysis

| Threat | Scenario | Mitigation | Residual |
|--------|----------|------------|----------|
| **S**poofing | Act as another approver | Delegated JWT; `req.user.oid` from the token, never the body; approver identity is the token subject | Low |
| **T**ampering | Alter/delete a recorded decision to fake (or erase) sign-off | `REVOKE update, delete on policy_approvals` — DB-enforced append-only; corrections are new rows | Low (DBA/superuser could still act — same as all ledgers) |
| **T**ampering | Change approver config mid-run to self-approve | Config (`PUT …/approvers`) is blocked while `in_review` (409 `bad_state`); changing it requires withdraw, which starts a fresh run | Low |
| **R**epudiation | "I didn't approve that" | Decision row binds token-derived `approver_oid` + `decided_at` + version + step; plus an `audit_log` entry per action | Low |
| **I**nfo disclosure | Employee reads a draft/rejected policy | Publish gate: `canRead` + employee `/policies` query require `approved_externally OR published` unless admin/owner/approver | Low |
| **I**nfo disclosure | Approver comment leaks to employees | Comments are only returned by `GET …/approvals`, which is only meaningful to admin/owner/approvers; employees don't reach the modal | Low |
| **D**enial of service | Mail outage stalls approvals | Notifications are fire-and-forget (`notify` swallows errors); the decision path never awaits mail | Low |
| **D**enial of service | Malformed ids / huge payloads | UUID param validation (`routes/index.js`); JSON body limits (platform); rule enum + integer coercion | Low |
| **E**levation | Non-approver approves; non-owner submits | `decide()` requires caller ∈ current step (or admin); `canGovern` gates submit/publish/config; templates are admin-only | Low |
| **E**levation | Later-step approver jumps the queue | `currentStep` is the first unsatisfied step; out-of-turn approve → 403 `not_pending_approver` | Low |

---

## 3. RBAC matrix

| Action | Employee | Approver (this policy) | Owner | Admin |
|--------|:-:|:-:|:-:|:-:|
| See a published policy | ✅ | ✅ | ✅ | ✅ |
| See a draft / in-review policy | ❌ | ✅ | ✅ | ✅ |
| Configure approvers / apply template | ❌ | ❌ | ✅ | ✅ |
| Submit / withdraw / publish | ❌ | ❌ | ✅ | ✅ |
| Approve / reject / request changes | ❌ | ✅ (their step) | ❌\* | ✅ (override) |
| Approve externally | ❌ | ❌ | ❌ | ✅ |
| Manage templates | ❌ | ❌ | ❌ | ✅ |
| List directory groups (for config) | ❌ | ❌ | ❌ | ✅ |

\* An owner who is *also* a named approver/group member on a step may act on that
step in the approver capacity — see abuse case A-2.

Enforcement points: `canGovern` and `canRead` in `authz.js`; `isAdmin` +
`requireAdmin`; the current-step check in `decide()`. See [LLD §5](LLD.md#5-api-reference)
for the per-endpoint authorization.

---

## 4. Abuse cases considered

- **A-1 Self-approval by the submitter.** The submitter is not automatically excluded from being an approver (ADR-120-d). *Rationale:* configuring a group is treated identically to naming those people; separation of duties is a **policy/configuration** responsibility (don't put the submitter on the chain), not something the system silently overrides. Documented as a non-goal, not a defect. Mitigation available today: the owner simply isn't placed on the chain.
- **A-2 Owner drives their own approval.** An owner can submit and publish, but cannot record an *approval decision* unless they are a configured approver on a step. The audit log distinguishes `submit`/`publish` (governance) from `approve` (decision).
- **A-3 Admin override.** Admins can decide on any step and `approve-externally`. This is intentional (break-glass) and fully audited; `approve-externally` is a distinct, separately-audited action so external sign-off is never confused with an in-portal run.
- **A-4 Stale template.** Editing/deleting a template cannot change a policy already configured from it (copy-in, ADR-120-b) — prevents a template edit from silently re-routing live approvals.
- **A-5 Membership drift.** Adding/removing group members during a run cannot change who must approve (snapshot-at-submit, ADR-120-c) — prevents "pack the group" attacks on an in-flight decision.

---

## 5. Control mapping

| Control | Framework refs | Realization |
|---------|----------------|-------------|
| Append-only decision ledger | ISO 27001 A.8.15 (logging), A.5.33 (protection of records) | `REVOKE update,delete on policy_approvals` |
| Least-privilege access | ISO 27001 A.8.2/A.8.3; Zero Trust | RBAC matrix §3; delegated tokens; `governance_app` role |
| Separation of duties | ISO 27001 A.5.3 | Distinct submit vs approve; per-step ownership (config responsibility, see A-1) |
| Segregation of visibility | Private-by-default | Publish gate in `canRead` |
| Auditability / accountability | ISO 27001 A.8.15; GDPR Art.5(2) accountability | `audit_log` on every mutation + decision ledger |
| Data minimization in notifications | GDPR Art.5(1)(c) | Email body carries name + policy, no decision content beyond the milestone |
| No new external permission | Least privilege | Group expansion reads the existing `effective_group_membership` view |

These feed the machine-checked catalogue in `../SECURITY-FRAMEWORKS.md` /
`compliance/controls.json`.

---

## 6. Residual risks & recommendations

| # | Residual risk | Severity | Recommendation | Owner |
|---|---------------|----------|----------------|-------|
| R-1 | A DBA/superuser can still mutate ledgers directly (outside the app role) | Low | Covered by the platform DB-access controls & backups; out of app scope | DBA / Ops |
| R-2 | No enforced separation of duties (submitter may be an approver) | Low–Med | Optional future toggle "exclude submitter from approving"; today a configuration guideline | Product |
| R-3 | Group config is admin-only, so manager-owners can't self-serve group steps | Low | Accept (mirrors the admin-only group list); revisit if managers need it | Product |
| R-4 | Approvals are not cryptographically signed | Low | Deferred (ADR-120); the append-only ledger + token identity matches the signature model | Security |
| R-5 | Reviewer comments retained indefinitely with the policy | Low | Covered by the platform retention/erasure tooling (`gdpr.js`); include in ROPA | DPO |

**Overall:** the feature introduces no new external attack surface, reuses the
platform's authenticated/authorized request path, and strengthens governance
integrity via an append-only, per-version, per-step decision ledger. Residual
risks are low and either accepted with rationale or tracked as optional
enhancements.
