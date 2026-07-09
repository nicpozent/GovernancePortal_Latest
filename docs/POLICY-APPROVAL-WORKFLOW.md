# Design: Policy Approval Workflow

**Status: Phase 1 (MVP) + Phase 2a/2b implemented; Phase 2c (templates) pending.**
Owner: engineering. Companion ADR: ADR-120 in `ARCHITECTURE-AND-DECISIONS.md`.

> **Shipped (Phase 1):** `migration_019_approvals.sql`; `src/routes/approvals.js`
> (configure approvers, submit, approve/reject/request-changes, withdraw, publish,
> admin approve-externally, status + pending queue); the publish gate in
> `authz.js` + the employee `/policies` query; append-only `policy_approvals`;
> friendly error codes; `test/integration/approvals.test.js`; and the in-app
> **Admin → Policy Library → Approvals** panel (`components/approvals.jsx`).
>
> **Shipped (Phase 2a):** config-gated, idempotent, fire-and-forget email
> notifications (current/next approver on submit/advance; the owner on
> approved/rejected/changes) and a dedicated **My approvals** screen backed by
> `/approvals/pending`.
>
> **Shipped (Phase 2b):** group approvers per step with an **all / any / quorum**
> rule (`migration_020_approval_steps.sql` — a step may hold multiple approvers;
> `policy_approval_steps` carries the rule + quorum count). `PUT …/approvers`
> accepts either the flat `{ approverOids }` form (one-per-step, rule `all`) or a
> `{ steps:[{ approverOids, rule, required }] }` form; the modal builds groups.
>
> **Deferred to Phase 2c:** reusable workflow *templates* and run snapshotting
> (`approval_workflows` / `_steps`, `approval_runs` / `_run_steps`) so template
> edits don't disrupt in-flight runs. The approver model on `policies` today still
> targets **people** only — group-of-directory-members targeting is part of 2c.

This design adds a pre-publication **approval workflow** to the portal: a policy is
drafted, routed through an ordered chain of approvers (e.g. Infra Manager → CISO →
CTO), and only becomes visible to employees for acknowledgement once **approved and
published**. It is the missing half of governance — today the portal only handles
*distribution + acknowledgement* of already-approved documents.

---

## 1. Goals & non-goals

**Goals**
- Per-policy, **per-version** approval before publishing, with statuses:
  Draft · In Review · Changes Requested · Approved · Published · Rejected · Retired.
- **Reusable, ordered approval workflows** (templates) assignable to policies, with
  approvers defined by person or role/group; add/remove/reorder steps.
- Approve / Reject / **Request changes** with required comments; full, **append-only**
  decision history (who approved which version, when, why) as compliance evidence.
- A **publish gate**: unapproved policies are private and cannot be assigned to
  employees.

**Non-goals (for now)**
- Parallel/quorum steps beyond what §4 specifies (Phase 2).
- E-signature-grade cryptographic signing of approvals (the append-only ledger +
  token-bound identity is the evidence model, consistent with `signatures`).
- Editing documents in-portal (rich authoring) — out of scope; approval works on the
  existing SharePoint-ref / uploaded-file model.

## 2. Backward compatibility (critical)

The migration defaults **every existing policy** to `approval_state = 'published'`
and `approved_externally = true`. So the day it ships, nothing changes: all current
policies stay live and acknowledgeable, and the approval flow only engages when an
admin explicitly submits a *new or edited* policy for review (or assigns a workflow).
No big-bang re-approval of the existing library.

## 3. Lifecycle & state machine

State lives on `policies.approval_state`. Approval is always tied to a **version**.

```
        submit (owner/admin)                 all steps satisfied
 Draft ─────────────────────────► In Review ────────────────────► Approved
  ▲  ▲                               │  │                              │ publish
  │  │  request changes (approver)   │  │ reject (approver/admin)      ▼
  │  └───────── Changes Requested ◄──┘  └──────────► Rejected     Published ──► (employees can acknowledge)
  │                    │ (edit)                         │ restart          │
  │                    └── resubmit ──► In Review        └── clone ► Draft   │ new version drafted
  └──────────────────────────────────────────────────────────────────────┘  (live version stays published
                                                                               until the new one is approved)
```

- **Draft** — private, editable. Owner prepares it (SharePoint ref or uploaded file).
- **In Review** — an approval *run* is active for the current version; the chain
  advances step by step.
- **Changes Requested** — an approver returned it (comment required); back to the
  owner to edit and **resubmit** (starts a fresh run for that version; prior decisions
  remain in the history).
- **Rejected** — terminal for that attempt; owner may clone to a new Draft.
- **Approved** — every step satisfied for the current version; `approved_version` set.
- **Published** — approved *and* released to assigned employees for acknowledgement.
- **Retired** — the existing archive (`archived_at`).

**Re-approval on a new version.** Editing a Published policy into a new version starts
a new Draft→In Review run **for the new version**; the currently published version
**stays live** (employees keep acknowledging it) until the new version is
Approved+Published, at which point the existing "new version ⇒ re-sign" logic kicks
in. `published_version` tracks what employees currently see; `approved_version` tracks
the latest approved. This avoids un-publishing a live policy during re-approval.

## 4. Approver model

**Reusable workflow templates**, assigned to a policy (a tenant default can apply when
none is chosen).

- A **workflow** is a named, ordered list of **steps**.
- A **step** targets approvers by **person** (`employees.oid`) or **group**
  (`groups.id`), with a satisfaction **rule**: `all` (every member), `any` (one), or
  `quorum` (N of M).
- **Sequential**: the current step is the lowest-position step not yet satisfied; only
  its approvers may act. When satisfied, the run advances; when the last step is
  satisfied, the policy becomes **Approved**.
- **Snapshot at submit.** When a policy is submitted, the workflow's steps are copied
  into the run (by value), so later edits to the template don't disrupt in-flight
  approvals.

Example template *"Standard IT Policy"*: `1. Owner review → 2. Infra Manager →
3. CISO (group: Security, quorum 1) → 4. CTO`.

## 5. Data model (Phase 2 target)

```sql
-- Reusable templates
create table approval_workflows (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table approval_workflow_steps (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references approval_workflows(id) on delete cascade,
  position int not null,
  name text not null,
  approver_kind text not null check (approver_kind in ('user','group')),
  approver_ref uuid not null,                 -- employees.oid | groups.id
  rule text not null default 'all' check (rule in ('all','any','quorum')),
  quorum_n int,                                -- when rule='quorum'
  unique (workflow_id, position)
);

-- Per-policy state (new columns on the existing table)
alter table policies add column approval_state text not null default 'published'
  check (approval_state in ('draft','in_review','changes_requested','rejected','approved','published'));
alter table policies add column approved_externally boolean not null default true;
alter table policies add column workflow_id uuid references approval_workflows(id);
alter table policies add column approved_version text;
alter table policies add column published_version text;
alter table policies add column submitted_at timestamptz;
alter table policies add column submitted_by uuid references employees(oid);

-- Active run + its snapshotted steps (one open run per policy/version)
create table approval_runs (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references policies(id) on delete cascade,
  policy_version text not null,
  workflow_id uuid,                            -- source template (nullable if ad-hoc)
  current_position int,                        -- step awaiting a decision; null when done
  state text not null default 'in_review',     -- in_review | approved | rejected | changes_requested | withdrawn
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create table approval_run_steps (               -- snapshot of the template steps for this run
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references approval_runs(id) on delete cascade,
  position int not null, name text not null,
  approver_kind text not null, approver_ref uuid not null,
  rule text not null default 'all', quorum_n int,
  satisfied_at timestamptz
);

-- Append-only decision ledger (compliance evidence — like signatures/audit_log)
create table policy_approvals (
  id bigserial primary key,
  policy_id uuid not null references policies(id) on delete cascade,
  policy_version text not null,
  run_id uuid references approval_runs(id) on delete set null,
  step_position int, step_name text,
  approver_oid uuid not null references employees(oid),
  decision text not null check (decision in ('approved','rejected','changes_requested')),
  comment text,
  decided_at timestamptz not null default now()
);
create index idx_polappr_policy on policy_approvals (policy_id, policy_version, decided_at);
```

**Grants (docker-grants.sql):** `select, insert` for the app role on
`policy_approvals`; **`revoke update, delete`** on it (append-only, like the other
ledgers). Workflow tables + `approval_runs`/`run_steps` get normal CRUD for admins via
the app role.

**MVP simplification.** Phase 1 can skip `approval_workflows`/`_steps` and the run
snapshot: store an ordered `approver_oids uuid[]` on the policy (or a tiny
`policy_approvers` table) and derive the current step from `policy_approvals`. The
`policies` columns and `policy_approvals` ledger are identical, so Phase 1 upgrades to
Phase 2 without reworking the ledger.

## 6. Publish gate (how it integrates)

- **Visibility:** the employee-facing policy list and `canRead` require
  `approval_state = 'published'` **or** `approved_externally = true`. Owner, admin, and
  any approver of the active run bypass this (so they can see it under review).
- **Assignment:** assigning a policy to groups is allowed in any state, but it only
  reaches employees once published. `publish` requires `approval_state = 'approved'`.
- Drafts/in-review policies are thus private-by-default — reusing the existing model,
  no new visibility concept.

## 7. API surface (Phase 2)

```
# Workflow templates (admin)
GET|POST            /api/approval-workflows
PUT|DELETE          /api/approval-workflows/:id
# Policy approval actions
POST /api/policies/:id/submit            {workflowId?}     draft -> in_review
POST /api/policies/:id/withdraw                            in_review -> draft (owner/admin)
POST /api/policies/:id/approve           {comment?}        current approver
POST /api/policies/:id/reject            {comment}         current approver / admin
POST /api/policies/:id/request-changes   {comment}         current approver -> changes_requested
POST /api/policies/:id/publish                             approved -> published (owner/admin)
POST /api/policies/:id/mark-approved-externally            admin escape hatch
GET  /api/policies/:id/approvals                           decision log + current step/state
GET  /api/approvals/pending                                "my queue": policies awaiting me
```

## 8. Authorization

- Manage workflow templates, `mark-approved-externally`, override-reject: **Admin**.
- `submit` / `withdraw` / `publish`: policy **owner** or Admin.
- `approve` / `reject` / `request-changes`: only an employee who matches the **current
  step** and hasn't already decided this run. (Admin may act as an override, audited.)
- Read a Draft/In-Review policy: owner, Admin, or an approver of its active run.
- New error codes to add to the catalogue + friendly map: `not_pending_approver`,
  `already_decided`, `not_approved` (publish gate), `no_workflow`, `bad_state`.

## 9. Notifications (Phase 2)

Reuse the reminder engine (`services/reminders.js`, Graph `sendMail`, HA-safe via the
leader lock) and `notifications_sent` (new milestone kinds, e.g. `approval:step:<n>`,
`approval:changes`, `approval:approved`) so each send is idempotent:
- On submit / step advance → email the current step's approver(s).
- On request-changes / reject → email the owner.
- On final approval → email the owner (and optionally publish reminder).

## 10. UI surfaces

- **Policy list / drawer:** a status **badge** (Draft/In Review/Changes Requested/
  Approved/Published/Rejected) reusing the existing pill styles.
- **Approvals panel** (policy detail): the chain with each step's state, decisions +
  comments, and Approve / Reject / Request-changes buttons for the pending approver.
- **"My approvals" queue** for approvers (backed by `GET /api/approvals/pending`).
- **Admin → Workflows**: create/edit chains, add/remove/reorder steps, pick approver
  (person or group) + rule.
- **Publish** button on an Approved policy; disabled with a tooltip otherwise.

## 11. Audit & integrity

- `policy_approvals` is **append-only** (grant-enforced), decisions bound to the
  **verified token** identity — never the client. Reject/Request-changes require a
  comment.
- Each decision also writes an `audit_log` entry via the existing `audit()` helper
  (`policy.approval.approve` / `.reject` / `.changes` / `.publish`).
- Approvals are **per-version**, so the evidence answers "who approved v2.0, when,
  with what comment" — exactly what an auditor asks.

## 12. Phasing

**Phase 1 (MVP):** `policies` approval columns; a simple ordered per-policy approver
list; `submit`/`approve`/`reject`/`request-changes`/`publish`; append-only
`policy_approvals`; publish gate; status badges + a basic approvals panel; new error
codes + friendly messages. Sequential; single-person steps; no templates/notifications.

**Phase 2:** reusable workflow templates; group approvers with all/any/quorum; run
snapshotting; notifications; "my approvals" queue; admin workflow editor; re-approval-
on-new-version polish; `mark-approved-externally`.

## 13. Open questions / edge cases (to confirm during build)

- **Owner as approver?** Allow (small orgs) but flag it, or forbid `owner == step
  approver`? Proposed: allow, with a UI note.
- **Template edited mid-run** → handled by the run snapshot (§4).
- **Approver employee deactivated mid-run** → admin can reassign the step or override.
- **Withdraw vs Reject** → withdraw is owner-initiated (back to Draft, no decision
  recorded); reject is an approver decision (recorded).
- **SharePoint-sourced policies** → default `approved_externally = true`; an admin can
  opt one into the workflow by submitting it.

## 14. Test plan

- **Unit:** state-machine transitions (legal/illegal), step-satisfaction rule
  (all/any/quorum), current-step derivation.
- **Integration (supertest + PG):** submit → sequential approvals → approved → publish;
  request-changes loop; reject; **publish gate** (employee can't see until published);
  **append-only** enforced (app role can't UPDATE/DELETE `policy_approvals`);
  per-version re-approval (approving v1 doesn't approve v2); authorization (only the
  pending approver can act).
- **Web (vitest):** badge states; approvals panel renders decisions/actions.
- **Coverage gate** already enforces floors; new modules must clear them.

## 15. Migration & rollout

- One migration `migration_019_approvals.sql` (tables + `policies` columns + indexes),
  added to `db/migrate.js`, the compose initdb mounts, and the append-only REVOKE in
  `docker-grants.sql`. Backward-compatible defaults per §2.
- Ship Phase 1 behind the default-published behaviour so it's inert until used; enable
  per-policy by submitting for review.
