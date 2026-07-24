# User Stories — Birgma Governance Portal (application-wide)

_Gherkin user stories with acceptance criteria and a story → endpoint → test
traceability matrix, covering the whole application. The policy **approval workflow**
has its own dedicated, finer-grained story set (with its own matrix) in
[`approval-workflow/USER-STORIES.md`](approval-workflow/USER-STORIES.md); this document
covers the rest and links there for approvals. Requirement IDs reference
[`REQUIREMENTS.md`](REQUIREMENTS.md); actors are defined in `REQUIREMENTS.md` §2._

---

## 1. Personas

| Persona | Goal |
|---------|------|
| **Employee** | Stay compliant: see, understand, and acknowledge assigned governance documents. |
| **Manager** | Keep their team compliant; own trainings for their area. |
| **Administrator** | Publish and target governance; run the platform. |
| **DPO / Auditor** | Extract evidence and exercise data-subject rights. |
| **System / Scheduler** | Run timed jobs (reminders, sync, backups) reliably. |
| **External integrator** | Consume compliance events via a secured feed/webhook. |

---

## 2. Employee

**US-01 — Acknowledge a policy** (FR-ACK-01/02)
> **As an** employee **I want to** record a binding "read & understood" **so that** my
> compliance is on record.
- **Given** an assigned, published policy **When** I submit an acknowledgement with my typed
  name **Then** a `signatures` row is written with my verified identity, the exact version,
  and a timestamp — and it can never be edited or deleted.
- **Given** I try again **Then** a correction is a new row, not a mutation.

**US-02 — Knowledge-check gate** (FR-QIZ-02, FR-ACK-04)
> **As an** employee **I want** the quiz graded fairly **so that** acknowledgement means I
> understood.
- **Given** a policy with a quiz **When** I submit answers **Then** grading happens
  server-side (answers never trusted from the client) and the attempt is append-only.
- **Given** I have not passed **When** I try to acknowledge **Then** signing is blocked.

**US-03 — See my obligations** (FR-ACK-03)
> **As an** employee **I want** to see outstanding vs completed items **so that** I know what
> is left.
- **Given** policies assigned to my groups **Then** unpublished/unassigned documents are
  never visible (private by default).

**US-04 — Preview the document** (FR-POL-08)
> **As an** employee **I want** the document to preview in-app **so that** I can read it
> without leaving.
- **Given** a PDF **Then** it renders inline; **Given** an Office file **Then** it is
  converted to PDF; **When** preview is unavailable **Then** a download/open-in-SharePoint
  fallback is offered.

**US-05 — Dark mode** (FR-UX-01/02)
> **As an** employee **I want** a light/dark theme that persists **so that** it's comfortable.
- **Given** I toggle the theme **Then** it persists on my device and defaults to the OS
  preference.

## 3. Manager

**US-06 — Team dashboard** (FR-RPT-02)
> **As a** manager **I want** my team's outstanding obligations **so that** I can act.
- **Given** my reports (functional-manager ∪ directory-manager) **Then** I see only my team's
  data — never other teams'.

**US-07 — Upload & target a training** (FR-TRN-01/02/03)
> **As a** manager **I want** to upload a training and assign it to my groups **without**
> touching others' content.
- **Given** a file with an allowed extension **Then** it is stored via the storage driver with
  a server-determined content type; **When** I edit another manager's training **Then** it is
  denied.

**US-08 — Nudge my team** (FR-NOT-03)
> **As a** manager **I want** to send reminders on demand.
- **Given** reminders are configured **Then** each milestone is sent at most once per user per
  version; **When** email is not configured **Then** the action is inert, not an error.

## 4. Administrator

**US-09 — Create a policy from SharePoint** (FR-POL-01/07)
> **As an** admin **I want** to browse SharePoint and pick a document **so that** the source of
> record stays in SharePoint.
- **Given** the connected site **When** I pick a document **Then** its drive/item/version are
  captured; **When** the owner I set is not a synced employee **Then** the owner is nulled
  rather than failing.

**US-10 — Target to groups** (FR-POL-04, FR-GRP-02)
> **As an** admin **I want** to assign a policy to groups **so that** the right people are
> obligated.
- **Given** platform and mapped directory groups **Then** effective membership is the union,
  computed from one source-of-truth view.

**US-11 — Manage groups & directory mappings** (FR-GRP-01/02/04)
> **As an** admin **I want** to manage groups and map directory groups in.
- **Given** a directory group **When** I map it into a platform group **Then** its members
  become effective members; **When** I archive a group **Then** assignments are retained.

**US-12 — Author a quiz** (FR-QIZ-01)
> **As an** admin **I want** to attach a knowledge check with a pass mark.

**US-13 — Manage employees** (FR-DIR-04)
> **As an** admin **I want** to add employees individually and by CSV and set a manager.
- **Given** a headered or positional CSV **Then** rows parse (quoted commas/escapes handled).

**US-14 — Compliance dashboards & export** (FR-RPT-01/03)
> **As an** admin **I want** overall/by-department/by-group dashboards with drill-down and CSV
> export.

**US-15 — Browse the audit log** (FR-AUD-01/02)
> **As an** admin **I want** an immutable record of who did what.
- **Given** any state-changing action **Then** an append-only `audit_log` row is written
  (actor, action, target, time) and never blocks the action.

## 5. Approver

Approver stories (configure steps, submit, approve/reject/request-changes, quorum/any/all,
group approvers, templates, pending queue) are specified with acceptance criteria and a
story→endpoint→test matrix in
[`approval-workflow/USER-STORIES.md`](approval-workflow/USER-STORIES.md) (US-A/…), realized by
FR-APR-01…13.

## 6. DPO / Auditor

**US-16 — DSAR export** (FR-DSR-01)
> **As a** DPO **I want** to export everything held about a person **so that** I can answer an
> access request.
- **Given** a subject oid **Then** the full per-subject package is returned and the export is
  itself audited; **Given** an unknown subject **Then** `404`.

**US-17 — Lawful erasure & retention** (FR-DSR-02/03)
> **As a** DPO **I want** erasure that preserves evidence integrity.
- **Given** an erasure **Then** ledger rows are pseudonymised/redacted, not deleted; **Given**
  retention config **Then** data past the window is purged.

## 7. System / Scheduler

**US-18 — Reminder ladder** (FR-NOT-01/02)
> **As the** scheduler **I want** to send escalating reminders on a schedule.
- **Given** the milestone ladder (assigned → due-20/15/7/1 → overdue) **Then** each is sent at
  most once per `(policy,user,version,milestone)`.

**US-19 — Scheduled backup** (FR-BKP-01/02)
> **As the** scheduler **I want** a daily `pg_dump` with retention and an off-host option.

**US-20 — Run jobs once when scaled out** (NFR-AVL-02)
> **As the** scheduler **I want** exactly one instance to run timed jobs.
- **Given** multiple replicas **Then** a Postgres advisory-lock leader election ensures a
  single runner; **When** the leader dies **Then** the lock releases.

**US-21 — Scheduled directory sync** (FR-DIR-02/03)
> **As the** scheduler **I want** to reconcile the directory.
- **Given** joiners/movers/leavers **Then** leavers are deactivated (never deleted) and every
  run is recorded in `sync_runs`.

## 8. External integrator

**US-22 — Pull the audit feed** (FR-AUD-03)
> **As an** integrator **I want** to pull audit events with an API key.
- **Given** the feed is enabled **When** I present the key **Then** events return (constant-time
  key compare, own rate limit); **Given** it is disabled **Then** `404 feed_disabled`.

**US-23 — Receive forwarded events / rotate the key** (FR-AUD-03/04)
> **As an** integrator **I want** events pushed to my webhook, and the admin able to rotate the
> credential.
- **Given** forwarding is configured **Then** events are POSTed (SSRF-guarded, fire-and-forget);
  **When** the admin rotates the feed key **Then** the old key stops working.

## 9. Identity & access (all roles)

**US-24 — Single sign-on** (FR-IAM-01/02/03)
> **As a** user **I want** to sign in with my Entra account.
- **Given** a delegated token **Then** the API validates signature/issuer/audience/tenant/scope
  and rejects app-only or foreign-tenant tokens.

**US-25 — Role switch & idle logout** (FR-IAM-05/06)
> **As an** admin/manager **I want** to switch views I'm entitled to, and be signed out when
> idle.
- **Given** 15 minutes of inactivity **Then** I am signed out locally.

---

## 10. Traceability (story → endpoints → tests)

Endpoints per module are detailed in [`LLD.md`](LLD.md) §4. Test files are under
`apps/api/test/integration/` (real Postgres) and `apps/web/test/`.

| Story | Primary endpoint(s) | Tests |
|-------|---------------------|-------|
| US-01/03 | `POST /signatures`, `GET /signatures`, `GET /policies` | `api.test.js` |
| US-02/12 | `POST /policies/:id/quiz/attempt`, `POST /policies/:id/quiz` | `api.test.js` |
| US-04/09 | `GET /policies/:id/content`, `GET /sharepoint/browse`, `POST /policies` | `api.test.js`, `services.test.js` |
| US-05 | SPA `theme.js` | `apps/web/test/ui.test.js` |
| US-06/08 | `GET /manager/dashboard`, `POST /manager/reminders/run` | `api.test.js`, `services.test.js` |
| US-07 | `POST/PUT /trainings*`, `GET /policies/:id/file` | `uploads.test.js` |
| US-10/11 | `POST /group-mappings`, `GET /groups*`, effective-membership view | `api.test.js`, `db.test.js` |
| US-13 | `POST /employees`, `/employees/bulk` | `api.test.js` |
| US-14 | `GET /dashboard*`, `/reports/compliance` | `api.test.js` |
| US-15 | `GET /audit`; `audit()` on mutations | `api.test.js`, `observability.test.js` |
| US-16/17 | `GET /admin/data-subject/:oid/export`; `gdpr.js` erasure/retention | `gdpr.test.js` |
| US-18/19/21 | `services/reminders.js`, backup job, `services/sync.js`, `POST /sync` | `services.test.js` |
| US-20 | `leader.js` `withLeaderLock` | `leader.test.js` |
| US-22/23 | `GET /feed/audit`, `logger.forwardEvent`, `POST /integrations/feed-key` | `observability.test.js` |
| US-24/25 | `requireAuth` (`auth.js`); SPA idle timer | `api.test.js` (authz paths) |
| Approver (US-A*) | see `approval-workflow/USER-STORIES.md §5` | `approvals`/`approval-templates`/`approval-groups.test.js` (22) |

_Coverage note: these stories are representative of each domain and actor, not exhaustive of
every endpoint in `LLD.md` §4. The approval workflow carries the fully exhaustive,
per-endpoint matrix in its own package._
