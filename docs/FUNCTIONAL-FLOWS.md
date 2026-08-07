# Functional Flows & Features — Birgma Governance Portal

_A functional, **user-perspective** view of the application: what it does, the
features by area, and the step-by-step interaction flows each persona follows
(with diagrams). For the technical request path see
[`request-sequence.mmd`](request-sequence.mmd); for endpoints see [`LLD.md`](LLD.md);
for requirements see [`REQUIREMENTS.md`](REQUIREMENTS.md)._

---

## 1. What the application does

The portal makes sure the right people **read, understand and acknowledge** the right
governance documents — and produces defensible, tamper-evident **evidence** that they
did. Administrators publish policies (optionally behind an approval chain and a
knowledge check) and target them at groups; employees see only what applies to them,
read it in-app, pass any quiz, and sign; managers and administrators watch compliance
climb on live dashboards.

## 2. Personas & roles

| Persona | Sees | Primary goal |
|---|---|---|
| **Employee** | Their assigned policies, trainings, quizzes | Stay compliant — read & acknowledge |
| **Manager** | Their team's compliance + own trainings | Keep the team compliant |
| **Administrator** | Everything: authoring, groups, sync, reports, integrations | Publish & govern; run the platform |
| **Approver** | Items awaiting their decision | Sign off before publication |
| **DPO / Auditor** | Audit trail, DSAR export | Evidence & data-subject rights |
| **System / Scheduler** | — (unattended) | Reminders, sync, backups |

Roles come from Entra app roles; the SPA shows an **Employee / Manager / Admin** view
switch for users entitled to more than one.

## 3. Feature catalogue

| Area | Feature | Who | Where (screen · flow) |
|---|---|---|---|
| Identity | SSO sign-in, role-view switch, 15-min idle logout | All | Sign-in · §5.1 |
| Policy lifecycle | Create/edit/version/archive; SharePoint document source | Admin | Policy library · §5.4 |
| Document access | In-app preview (PDF/Office→PDF), download fallback | All (authorized) | Reader · §5.1 |
| Acknowledgement | Binding, append-only signature + certificate | Employee | Reader · §5.1 |
| Knowledge check | Server-graded quiz, quiz-gated signing | Employee | Reader · §5.1 |
| Approval workflow | Ordered steps (all/any/quorum), group approvers, templates | Admin/Approver | Approvals · §5.5 |
| Targeting | Groups, directory-group mapping, effective membership | Admin | Groups & access · §5.6 |
| Directory sync | Least-privilege Entra/Graph import (assigned only) | Admin/System | Employees · §5.6 |
| Manager trainings | Upload & assign training material | Manager | Trainings · §5.3 |
| Reporting | Dashboards (overall/dept/group), drill-down, CSV export | Admin/Manager | Dashboard · §5.7 |
| Notifications | Escalating reminder ladder; manual nudges | System/Manager | (background) · §5.8 |
| Audit | Immutable audit log; pull/push feed | Admin/Auditor | Audit log · §5.7 |
| Data protection | DSAR export, evidence-preserving erasure, retention | Admin/DPO | Integrations/Admin · §5.9 |
| Operations | Backups, disaster recovery, integrations config | Admin | Backups/Integrations |
| Experience | Light/dark theme, friendly error messages | All | Global |

---

## 4. Top-level navigation

```mermaid
flowchart LR
  SI["Sign in with Microsoft"] --> ROLE{"Entra role?"}
  ROLE -->|Employee| EMP["My policies · My signatures"]
  ROLE -->|Manager| MGR["Team dashboard · Trainings"]
  ROLE -->|Admin| ADM["Dashboard · Policy library · Employees · Groups & access · Audit · Integrations · Backups · Approvals"]
  EMP --> SW["Role-view switch (if entitled)"]
  MGR --> SW
  ADM --> SW
```

---

## 5. User interaction flows

### 5.1 Employee — acknowledge a policy (with a knowledge check)

**Steps:** sign in → open an assigned policy → read it in-app → (if present) take the
quiz and pass → type name & confirm → acknowledgement recorded → download certificate.

```mermaid
flowchart TD
  A["Sign in (Microsoft)"] --> B["My policies — see assigned & outstanding"]
  B --> C["Open a policy → in-app preview"]
  C --> D{"Quiz required?"}
  D -->|No| G["Type full name + confirm 'I have read & understood'"]
  D -->|Yes| E["Take quiz (graded server-side)"]
  E --> F{"Passed?"}
  F -->|No| E2["Review & retry"]
  E2 --> E
  F -->|Yes| G
  G --> H["Acknowledgement written to append-only ledger<br/>(identity + version + timestamp)"]
  H --> I["'Successfully acknowledged' + printable certificate"]
```

- The document is invisible unless it is assigned to the employee's group **and**
  published — private by default.
- Answers are graded on the server (never trusted from the browser); signing is
  blocked until the quiz is passed.
- The signature cannot later be edited or deleted (append-only ledger).

### 5.2 Employee — see what's outstanding
My policies / My signatures list assigned items with status (outstanding, signed,
re-sign required after a new version). A new version re-opens acknowledgement.

### 5.3 Manager — team compliance, trainings & nudges

```mermaid
flowchart TD
  M0["Sign in → switch to Manager view"] --> M1["Team dashboard: who is outstanding"]
  M1 --> M2{"Action?"}
  M2 -->|Upload training| T1["Upload file → assign to my groups → 'reaches N people'"]
  M2 -->|Send reminders| R1["Run reminders (idempotent, config-gated)"]
  M2 -->|Review| M1
```

Managers only ever see and act on **their own team** (functional-manager reports ∪
directory-manager matches) and their **own** trainings.

### 5.4 Administrator — onboard & publish a policy

```mermaid
flowchart TD
  P0["Policy library → New policy"] --> P1["Browse SharePoint → pick the document"]
  P1 --> P2["Set name, version, due date, owner"]
  P2 --> P3["Assign to group(s) → effective membership resolves the audience"]
  P3 --> P4{"Use approval workflow?"}
  P4 -->|No| P6["Publish (or mark approved externally)"]
  P4 -->|Yes| P5["Configure approvers → Submit → approval chain (§5.5)"]
  P5 --> P6
  P6 --> P7["Visible to the assigned population; re-acknowledge required on new versions"]
```

### 5.5 Approval workflow — submit → decide → publish

Applies when a policy uses the workflow. Ordered **steps**; each step is satisfied by
**all**, **any**, or a **quorum** of its approvers (people and/or directory groups,
frozen to members at submit).

```mermaid
stateDiagram-v2
  [*] --> Draft
  Draft --> InReview: submit (freeze group approvers)
  InReview --> InReview: step approved, more steps remain
  InReview --> Approved: final step satisfied
  InReview --> ChangesRequested: request changes (+comment)
  InReview --> Rejected: reject (+comment)
  ChangesRequested --> InReview: resubmit (fresh run)
  Rejected --> InReview: resubmit
  Approved --> Published: publish
  Published --> Draft: edit to a NEW version (re-approval required)
  InReview --> Draft: withdraw
```

- Employees cannot see a policy while it is under review — only owner, admin and
  configured approvers can (so they can act).
- A policy already approved/published for the **current** version cannot be
  re-submitted; editing it to a **new version** returns it to Draft for re-approval.
- Every decision is written to an append-only decision ledger.

### 5.6 Administrator — groups, directory mapping & sync

```mermaid
flowchart TD
  S0["Employees → Sync now"] --> S1["Import assigned Entra users + groups (least privilege)"]
  S1 --> S2["Groups & access"]
  S2 --> S3{"Targeting method"}
  S3 -->|Map a directory group| S4["Map AD group → platform group"]
  S3 -->|Local group| S5["Create local group + add members"]
  S4 --> S6["Effective membership = direct ∪ mapped"]
  S5 --> S6
  S6 --> S7["Assign policies/trainings to these groups"]
```

Sync reads **only** principals assigned to the Governance app (least privilege) and
**deactivates** leavers rather than deleting them.

### 5.7 Administrator — assurance: dashboards, reports & audit
Overall / by-department / by-group compliance with drill-down to who has signed; CSV
export for auditors; an **immutable audit log** of every admin action, browsable
in-app and consumable off-host via the pull/push feed. Documents assigned to no group
read **"not assigned"** rather than a misleading 0%.

### 5.8 System / Scheduler — unattended jobs
Reminder ladder (assigned → due-20/15/7/1 → overdue, each sent at most once per
person/version), daily backup, and directory sync run on timers. When scaled to more
than one instance a **Postgres advisory-lock leader election** ensures exactly one
runner. Failures never block user actions.

### 5.9 DPO / Auditor — data-subject rights

```mermaid
flowchart LR
  D0["Data-subject request"] --> D1{"Type"}
  D1 -->|Access| D2["DSAR export — full per-subject package (admin-only, audited)"]
  D1 -->|Erasure| D3["Pseudonymise / redact — ledger rows preserved for integrity"]
  D1 -->|Retention| D4["Purge data past the configured window"]
```

---

## 6. Cross-cutting experience

- **Single sign-on**: one Microsoft sign-in; the API validates every request
  (signature/issuer/audience/tenant/scope) — no separate password.
- **Role-view switch**: users entitled to Manager/Admin can switch views; each view
  is re-authorised server-side.
- **Document preview**: PDFs render inline; Office files convert to PDF; a
  download/open-in-SharePoint fallback appears when preview is unavailable.
- **Idle logout**: automatic sign-out after 15 minutes of inactivity.
- **Theming**: light/dark toggle, remembered per device, defaulting to the OS setting.
- **Friendly errors**: server error codes map to plain-language messages (a ~32-code
  catalogue) rather than raw failures.

## 7. Golden path (end-to-end)

Admin picks a SharePoint document → assigns it to a group → routes it through approval
→ publishes → the assigned employees are reminded → each reads it, passes the quiz, and
signs → the manager and admin watch compliance reach 100% → an auditor exports the CSV
and the immutable audit trail. The runtime version of this path is
[`request-sequence.mmd`](request-sequence.mmd).

## 8. References

[`REQUIREMENTS.md`](REQUIREMENTS.md) · [`USER-STORIES.md`](USER-STORIES.md) ·
[`HLD.md`](HLD.md) · [`LLD.md`](LLD.md) · [`USER-GUIDE.md`](USER-GUIDE.md) ·
approval detail in [`approval-workflow/`](approval-workflow/README.md) ·
diagrams [`request-sequence.mmd`](request-sequence.mmd) /
[`architecture-diagram.mmd`](architecture-diagram.mmd).
