# Requirements Specification — Birgma Governance Portal

_Consolidated functional, non-functional, and candidate (future) requirements,
derived from the codebase, tests, CI, and the decision records. Authoritative and
kept in sync with `main`. Companions:
[`ARCHITECTURE-AND-DECISIONS.md`](ARCHITECTURE-AND-DECISIONS.md) (ADRs),
[`ARCHITECTURE-BUILDING-BLOCKS.md`](ARCHITECTURE-BUILDING-BLOCKS.md) (ABBs/SBBs),
[`APPLICATION-EVALUATION.md`](APPLICATION-EVALUATION.md) (maturity),
[`approval-workflow/`](approval-workflow/README.md) (feature package)._

---

## 1. Purpose & scope

The Birgma Governance Portal distributes governance documents (policies,
procedures, manager trainings), collects binding **acknowledgements** — optionally
gated on a **knowledge check** — routes documents through a **pre-publication
approval** chain, targets obligations at people via **groups**, and produces
**assurance evidence** (dashboards, exports, append-only ledgers) for auditors and
leadership. Identity is federated to **Microsoft Entra ID**.

This document specifies **what** the system must do (functional), the **qualities**
it must exhibit (non-functional), and **candidate** requirements deferred by
choice. It is technology-aware but requirement-first.

## 2. Actors

| Actor | Description | App role |
|-------|-------------|----------|
| **Employee** | Any authenticated member of the org; reads & acknowledges assigned documents | (none) |
| **Manager** | Owns/administers trainings & team obligations for their scope | `Governance.Manager` |
| **Administrator** | Full governance administration | `Governance.Admin` |
| **Approver** | A person named on, or a member of a group on, an approval step (a per-policy assignment, not an app role) | (assignment) |
| **DPO / Auditor** | Consumes evidence: exports, audit feed, DSAR output | (via Admin) |
| **System / Scheduler** | Timed jobs: reminders, directory sync, backups | (service identity) |
| **External integrator** | Consumes the authenticated audit feed / receives forwarded events | (feed key / webhook) |

## 3. Conventions

- **IDs**: `FR-<domain>-nn` (functional), `NFR-<quality>-nn` (non-functional), `CR-nn` (candidate/future).
- **Priority (MoSCoW)**: **M** Must · **S** Should · **C** Could.
- **Status**: ✅ Implemented · ◑ Partial (operator/org action to complete) · ○ Planned/Candidate.
- **Source/realization** references code modules, ADRs, or docs.

---

## 4. Functional requirements

### 4.1 Identity & access management (FR-IAM)

| ID | Requirement | Pri | Status | Source / realization |
|----|-------------|-----|--------|----------------------|
| FR-IAM-01 | The system shall authenticate users via Microsoft Entra ID single sign-on (OIDC/OAuth2, MSAL, PKCE). | M | ✅ | `api.js` (SPA), ADR-101/104 |
| FR-IAM-02 | The API shall validate every request's access token: signature (RS256, pinned), issuer, audience, tenant, and required scope. | M | ✅ | `auth.js`, ADR-102 |
| FR-IAM-03 | The API shall reject application-only tokens and tokens from foreign tenants (delegated-user tokens only). | M | ✅ | `auth.js` |
| FR-IAM-04 | The system shall support two app roles — `Governance.Admin` and `Governance.Manager` — surfaced from the token. | M | ✅ | `auth.js`, `authz.js` |
| FR-IAM-05 | The SPA shall let an Admin/Manager switch between Employee/Manager/Admin views they are entitled to. | S | ✅ | `app.jsx` (role switch) |
| FR-IAM-06 | The SPA shall sign the user out locally after 15 minutes of inactivity. | S | ✅ | `app.jsx` idle timer, `IDLE_LOGOUT_MS` |
| FR-IAM-07 | The system shall support local sign-out (clear local token cache) and full Entra sign-out. | M | ✅ | `api.js` `signOut`/`localSignOut` |

### 4.2 Policy lifecycle (FR-POL)

| ID | Requirement | Pri | Status | Source |
|----|-------------|-----|--------|--------|
| FR-POL-01 | Admins shall create, edit, version, and archive/restore policies. | M | ✅ | `routes/policies.js` |
| FR-POL-02 | A policy shall carry a version; publishing a new version requires affected employees to re-acknowledge. | M | ✅ | `policies`, `policy_versions`, signatures re-sign logic |
| FR-POL-03 | Policy documents shall be viewable in-app, sourced from SharePoint via least-privilege `Sites.Selected`. | M | ✅ | `services/sharepoint.js`, ADR-112 |
| FR-POL-04 | A policy shall be assignable to one or more groups; assignment may occur in any state. | M | ✅ | `policy_groups` |
| FR-POL-05 | Version history of a policy shall be viewable. | S | ✅ | `policyVersions`, review history (mig 014) |
| FR-POL-06 | A policy shall be invisible to employees unless it is approved-externally or published (publish gate). | M | ✅ | `authz.js` `canRead`, ADR-120 |

### 4.3 Acknowledgement / attestation (FR-ACK)

| ID | Requirement | Pri | Status | Source |
|----|-------------|-----|--------|--------|
| FR-ACK-01 | An employee shall record a binding "read & understood" acknowledgement of a policy version. | M | ✅ | `routes/signatures.js` |
| FR-ACK-02 | Acknowledgements shall be append-only, identity-bound, version-stamped, and timestamped. | M | ✅ | `signatures` + DB grant revoke, ADR-109 |
| FR-ACK-03 | An employee shall see their own outstanding and completed acknowledgements. | M | ✅ | `app.jsx` my-signatures/my-policies |
| FR-ACK-04 | Where a knowledge check is configured, signing shall be gated on a passing attempt. | M | ✅ | quiz gate, `routes/quizzes.js` |

### 4.4 Knowledge checks / quizzes (FR-QIZ)

| ID | Requirement | Pri | Status | Source |
|----|-------------|-----|--------|--------|
| FR-QIZ-01 | Admins shall author a quiz per policy (questions, options, correct answers, pass %). | S | ✅ | `routes/quizzes.js`, mig 011 |
| FR-QIZ-02 | Quiz attempts shall be graded server-side; answers/correctness never trusted from the client. | M | ✅ | `routes/quizzes.js` |
| FR-QIZ-03 | Quiz attempts shall be append-only. | M | ✅ | `quiz_attempts` + grant revoke |
| FR-QIZ-04 | Admins shall archive/restore/delete a quiz and view attempt analytics. | S | ✅ | quiz archive (mig 012), analytics |

### 4.5 Manager trainings (FR-TRN)

| ID | Requirement | Pri | Status | Source |
|----|-------------|-----|--------|--------|
| FR-TRN-01 | Managers shall upload training documents (files) and assign them to groups. | S | ✅ | `routes/trainings.js`, mig 016 |
| FR-TRN-02 | Uploaded files shall be stored via the storage abstraction with a server-determined content type and an extension allowlist. | M | ✅ | `storage.js`, `multer`, ADR-111 |
| FR-TRN-03 | A manager shall act only on their own trainings/team (ownership + scope enforced). | M | ✅ | `authz.js` `canManage`, `requireManager` |
| FR-TRN-04 | Managers shall archive a training. | S | ✅ | `routes/trainings.js` |

### 4.6 Pre-publication approval workflow (FR-APR) — ADR-120

| ID | Requirement | Pri | Status | Source |
|----|-------------|-----|--------|--------|
| FR-APR-01 | An owner/admin shall configure an ordered chain of approval **steps** for a policy. | M | ✅ | `routes/approvals.js` (Phase 1) |
| FR-APR-02 | A step shall hold one or more approvers with a satisfaction rule: **all**, **any**, or **quorum(N)**. | M | ✅ | Phase 2b, `policy_approval_steps` |
| FR-APR-03 | An approver on a step shall be a named person or a **directory group** resolved to its members. | M | ✅ | Phase 2d, `policy_approver_groups` |
| FR-APR-04 | Group approvers shall be resolved to current members and **frozen at submit** (snapshot); membership changes shall not alter an in-flight run. | M | ✅ | `expandGroups`, ADR-120-c |
| FR-APR-05 | The workflow shall support states Draft, In Review, Changes Requested, Rejected, Approved, Published, per policy **version**. | M | ✅ | `policies.approval_state` |
| FR-APR-06 | A current-step approver (or an admin) shall approve, reject, or request changes; reject/changes require a comment. | M | ✅ | `decide()` |
| FR-APR-07 | Approval decisions shall be recorded in an **append-only** ledger (version, step, approver, decision, comment, time). | M | ✅ | `policy_approvals` + grant revoke |
| FR-APR-08 | An owner/admin shall submit, withdraw, and publish; publish shall be blocked unless the policy is Approved. | M | ✅ | `submit`/`withdraw`/`publish` |
| FR-APR-09 | An admin shall mark a policy **approved externally** (break-glass), separately audited. | M | ✅ | `approve-externally` |
| FR-APR-10 | Admins shall author reusable approval **templates**; applying a template **copies** its steps onto the policy (edits/deletes to a template shall not disturb configured policies). | S | ✅ | `routes/approval-templates.js`, ADR-120-b |
| FR-APR-11 | The system shall present each user a "My approvals" queue of policies awaiting their decision. | S | ✅ | `/approvals/pending`, `MyApprovals` |
| FR-APR-12 | The system shall notify the relevant approver(s) on submit/advance and the owner on outcome (config-gated, idempotent, non-blocking). | S | ✅ | `emailOnce`/`notify`, Phase 2a |
| FR-APR-13 | An owner/admin (and configured approvers) shall see a policy under review; employees shall not until published. | M | ✅ | `canRead` publish gate |

_Detailed acceptance criteria: [`approval-workflow/USER-STORIES.md`](approval-workflow/USER-STORIES.md)._

### 4.7 People & directory (FR-DIR)

| ID | Requirement | Pri | Status | Source |
|----|-------------|-----|--------|--------|
| FR-DIR-01 | The system shall maintain an employee master (identity, department, manager, status). | M | ✅ | `employees`, mig 008/015 |
| FR-DIR-02 | The system shall synchronize in-scope users/groups from Entra via SCIM push **or** AU-scoped Graph, least-privilege. | M | ✅ | `services/sync.js`, SCIM, ADR-112 |
| FR-DIR-03 | Offboarding shall deactivate (never delete) a user, preserving history. | M | ✅ | sync leaver handling; former employees |
| FR-DIR-04 | Admins shall add employees individually and via CSV bulk import, and set an employee's functional manager. | S | ✅ | `routes/employees.js` |
| FR-DIR-05 | The system shall expose sync status/history. | S | ✅ | `sync_runs`, `syncStatus` |

### 4.8 Groups & obligation targeting (FR-GRP)

| ID | Requirement | Pri | Status | Source |
|----|-------------|-----|--------|--------|
| FR-GRP-01 | Admins shall manage platform (local) groups and their members. | M | ✅ | `routes/groups.js`, mig 002 |
| FR-GRP-02 | Directory groups shall be mappable into any platform group; effective membership shall be the union (direct + mapped). | M | ✅ | `group_mappings`, `effective_group_membership` view, mig 005/018 |
| FR-GRP-03 | Effective membership shall be computed from a single source-of-truth view used by every consumer. | M | ✅ | mig 018 (fixes duplicate-query drift) |
| FR-GRP-04 | Admins shall archive/restore/delete groups, retaining assignments where archived. | S | ✅ | mig 007, `routes/groups.js` |
| FR-GRP-05 | The system shall report the reach (member count) of a group/selection. | C | ✅ | `groupReach` |

### 4.9 Notifications & reminders (FR-NOT)

| ID | Requirement | Pri | Status | Source |
|----|-------------|-----|--------|--------|
| FR-NOT-01 | The system shall send acknowledgement reminders on a milestone ladder (assigned → due-N → overdue) on a schedule. | S | ✅ | `services/reminders.js`, mig 009/010/013 |
| FR-NOT-02 | Each reminder milestone shall be sent at most once per user per policy version (idempotent). | M | ✅ | `notifications_sent` unique constraint |
| FR-NOT-03 | Managers/admins shall trigger reminders on demand. | S | ✅ | `runReminders`, `managerReminders` |
| FR-NOT-04 | Email shall be sent via Graph `sendMail`; the feature shall be inert unless `GRAPH_MAIL_SENDER` is configured. | M | ✅ | ADR-113, config-gated |
| FR-NOT-05 | Notification failures shall never fail or block the triggering action. | M | ✅ | fire-and-forget `notify` |

### 4.10 Dashboards & reporting (FR-RPT)

| ID | Requirement | Pri | Status | Source |
|----|-------------|-----|--------|--------|
| FR-RPT-01 | Admins shall view compliance dashboards overall, by department, and by group, with drill-down. | M | ✅ | `routes/dashboards.js` |
| FR-RPT-02 | Managers shall view a team dashboard scoped to their reports. | M | ✅ | `managerDashboard` |
| FR-RPT-03 | Admins shall export a compliance report (CSV), scopable by group/department. | S | ✅ | `complianceReport` |
| FR-RPT-04 | The system shall provide an evidence-based maturity self-assessment (in-app + doc). | C | ✅ | `evaluation.jsx`, `APPLICATION-EVALUATION.md` |

### 4.11 Audit & evidence (FR-AUD)

| ID | Requirement | Pri | Status | Source |
|----|-------------|-----|--------|--------|
| FR-AUD-01 | The system shall record an append-only audit event for every state-changing action (actor, action, target, time). | M | ✅ | `audit_log` + grant revoke, mig 006 |
| FR-AUD-02 | Admins shall browse the audit log in-app. | S | ✅ | `routes/audit`, `AuditLog` |
| FR-AUD-03 | The system shall expose an authenticated **pull** audit feed and support **push** (webhook) forwarding of events. | S | ✅ | `/feed/audit`, `logger.forwardEvent`, ADR-115 |
| FR-AUD-04 | Integration feed credentials shall be rotatable. | S | ✅ | `rotateFeedKey` |

### 4.12 Data-subject rights / GDPR (FR-DSR)

| ID | Requirement | Pri | Status | Source |
|----|-------------|-----|--------|--------|
| FR-DSR-01 | An admin shall export all personal data held for a subject (DSAR). | M | ✅ | `routes/admin.js` DSAR, `src/gdpr.js` |
| FR-DSR-02 | The system shall erase a subject's personal data while preserving append-only ledger integrity (pseudonymize/redact, not delete evidence rows). | M | ✅ | `gdpr.js` `eraseSubject`, `db/gdpr.js` CLI |
| FR-DSR-03 | The system shall purge data past a configurable retention window. | S | ✅ | `gdpr.js` `purgeRetention` |
| FR-DSR-04 | Data collection shall be minimized (limited Graph attributes; `Sites.Selected`). | M | ✅ | `services/sync.js`, ADR-112 |

### 4.13 Backup & recovery (FR-BKP)

| ID | Requirement | Pri | Status | Source |
|----|-------------|-----|--------|--------|
| FR-BKP-01 | The system shall take scheduled database backups (`pg_dump`) with retention. | M | ✅ | backup job, ADR-114 |
| FR-BKP-02 | Uploaded files shall be included in backups, with an off-host destination option. | M | ✅ | `backup-uploads.ps1`, `backup-all.ps1` |
| FR-BKP-03 | Admins shall list, create, and download backups in-app. | S | ✅ | `routes/admin.js` backups |
| FR-BKP-04 | A documented, rehearsed disaster-recovery procedure shall exist. | M | ✅ | `DISASTER-RECOVERY.md` (DB restore verified) |

### 4.14 Integrations & administration (FR-ADM)

| ID | Requirement | Pri | Status | Source |
|----|-------------|-----|--------|--------|
| FR-ADM-01 | Admins shall view/edit integration configuration (feed, forwarding, test). | S | ✅ | `routes/integrations`, mig 017 |
| FR-ADM-02 | SPA runtime configuration shall be injected from environment at container start (no rebuild per environment). | M | ✅ | `config.js`, ADR-116 |
| FR-ADM-03 | Database schema changes shall be applied by a tracked, transactional migration runner, safe to re-run. | M | ✅ | `db/migrate.js`, `DATABASE-MIGRATIONS.md` |

### 4.15 Personalization / experience (FR-UX)

| ID | Requirement | Pri | Status | Source |
|----|-------------|-----|--------|--------|
| FR-UX-01 | Each user shall toggle a light/dark theme from the app header (all roles). | S | ✅ | `theme.js`, `app.jsx` header toggle |
| FR-UX-02 | The theme preference shall persist across sessions on the user's device and default to the OS preference. | S | ✅ | `localStorage` `gp-theme`, `prefers-color-scheme` |
| FR-UX-03 | The saved theme shall apply before first paint (no flash of the wrong theme). | S | ✅ | inline init in `index.html` |
| FR-UX-04 | Light mode shall be visually unchanged by the introduction of theming. | M | ✅ | token light values == prior hexes; verified |
| FR-UX-05 | Error responses shall map to friendly, actionable user messages, linkable to troubleshooting. | S | ✅ | `errors.js`, `TROUBLESHOOTING.md` (32-code catalogue) |

### 4.16 Health & operational endpoints (FR-OBS)

| ID | Requirement | Pri | Status | Source |
|----|-------------|-----|--------|--------|
| FR-OBS-01 | The API shall expose Prometheus metrics (`/metrics`, RED + runtime). | S | ✅ | `metrics.js` |
| FR-OBS-02 | The API shall expose a readiness endpoint (`/readyz`) that checks database connectivity. | M | ✅ | `metrics.js` / `app.js` |
| FR-OBS-03 | Containers shall define healthchecks. | S | ✅ | compose / Dockerfile healthchecks |

---

## 5. Non-functional requirements

### 5.1 Security (NFR-SEC)

| ID | Requirement | Pri | Status | Source |
|----|-------------|-----|--------|--------|
| NFR-SEC-01 | All traffic shall be over TLS; security headers and a strict CSP shall be set at the edge. | M | ✅ | nginx + `helmet` |
| NFR-SEC-02 | Authorization shall be enforced server-side on every request (role + ownership + effective membership); default deny; no client-trusted decisions. | M | ✅ | `authz.js`, ADR (PDP) |
| NFR-SEC-03 | All SQL shall be parameterized; no string-built queries. | M | ✅ | `pg` parameterized throughout |
| NFR-SEC-04 | The application shall connect to the database as a least-privilege role; ledger tables shall have UPDATE/DELETE revoked. | M | ✅ | `docker-grants.sql`, ADR-109 |
| NFR-SEC-05 | File uploads shall be constrained by an extension allowlist and served with a server-determined content type. | M | ✅ | ADR-111 |
| NFR-SEC-06 | CORS shall be single-origin; the API shall be reachable only via the same-origin proxy. | M | ✅ | nginx, CORS config |
| NFR-SEC-07 | Request rate limiting shall be applied, with a store pluggable to shared Redis for multi-instance correctness. | S | ✅ | `ratelimit.js`, ADR-119 |
| NFR-SEC-08 | No secrets shall be committed; `.gitignore` shall cover env/certs/keys/backups/uploads; CI shall scan for secrets (gitleaks). | M | ✅ | `.gitignore`, `security.yml` |
| NFR-SEC-09 | Outbound HTTP targets shall be validated to block loopback/link-local (SSRF hardening). | M | ◑ | `isSafeHttpUrl`; DNS-rebind residual noted |
| NFR-SEC-10 | Multi-factor authentication / Conditional Access shall gate access. | M | ◑ | Entra-side (org action); not app-enforced |
| NFR-SEC-11 | Data shall be encrypted at rest; DB connections shall use TLS (`PGSSL`). | M | ◑ | host BitLocker/CMK + `PGSSL` supported, off by default |

### 5.2 Privacy & data protection (NFR-PRV)

| ID | Requirement | Pri | Status | Source |
|----|-------------|-----|--------|--------|
| NFR-PRV-01 | Personal data shall be minimized to what governance requires. | M | ✅ | 5-attr sync, `Sites.Selected` |
| NFR-PRV-02 | Data-subject rights (access, erasure, retention) shall be operable without breaking evidence integrity. | M | ✅ | `gdpr.js` |
| NFR-PRV-03 | Processing records (ROPA), a DPIA, and a privacy notice shall be maintained. | M | ◑ | drafted in `docs/gdpr/`; DPO sign-off pending |
| NFR-PRV-04 | Notification content shall not leak decision detail beyond the milestone. | S | ✅ | approval notifications |

### 5.3 Integrity & non-repudiation (NFR-INT)

| ID | Requirement | Pri | Status | Source |
|----|-------------|-----|--------|--------|
| NFR-INT-01 | Signatures, audit events, quiz attempts, and approval decisions shall be append-only, enforced at the database privilege layer. | M | ✅ | grant revokes, ADR-109 |
| NFR-INT-02 | Evidence shall bind a verified identity, a timestamp, and (for attestations/approvals) the exact version acted upon. | M | ✅ | ledger schemas |
| NFR-INT-03 | Corrections shall be new records, never edits/deletes. | M | ✅ | append-only model |

### 5.4 Availability, reliability & DR (NFR-AVL)

| ID | Requirement | Pri | Status | Source |
|----|-------------|-----|--------|--------|
| NFR-AVL-01 | The application tier shall be stateless-ready (externalized storage, leader-elected schedulers, shared rate-limit store) to support >1 instance. | S | ✅ | `storage.js`, `leader.js`, `ratelimit.js` |
| NFR-AVL-02 | Scheduled jobs shall run on exactly one instance when scaled out (advisory-lock leader election). | M | ✅ | `leader.js`, ADR-114/119 |
| NFR-AVL-03 | A rehearsed DR procedure with off-host backups shall meet recoverability expectations. | M | ✅ | `DISASTER-RECOVERY.md` |
| NFR-AVL-04 | Point-in-time recovery / replication shall be available. | S | ○ | deferred to Azure managed PG |

### 5.5 Performance (NFR-PRF)

| ID | Requirement | Pri | Status | Source |
|----|-------------|-----|--------|--------|
| NFR-PRF-01 | Token validation overhead shall be constant per request (JWKS cached with TTL). | M | ✅ | `auth.js` |
| NFR-PRF-02 | Frequent status/queue reads (approvals, effective membership) shall be indexed. | S | ✅ | indexes; single-source view |
| NFR-PRF-03 | The SPA production bundle shall be pre-built (no in-browser transpile), self-hosted (no CDN). | M | ✅ | Vite, ADR-105 |
| NFR-PRF-04 | Load/performance testing shall be conducted. | S | ○ | not yet (candidate) |

### 5.6 Scalability (NFR-SCL)

| ID | Requirement | Pri | Status | Source |
|----|-------------|-----|--------|--------|
| NFR-SCL-01 | Object/file storage shall be swappable to Azure Blob without re-architecture. | S | ✅ | `storage.js` (A12) |
| NFR-SCL-02 | Horizontal scale-out shall be supported once the shared stores are enabled. | S | ◑ | groundwork done; single-instance today |

### 5.7 Observability (NFR-OBS)

| ID | Requirement | Pri | Status | Source |
|----|-------------|-----|--------|--------|
| NFR-OBS-01 | Logs shall be structured (JSON) with a correlation/request id and secret redaction. | M | ✅ | `pino`/`pino-http` |
| NFR-OBS-02 | RED metrics and a DB-checked readiness probe shall be exposed. | S | ✅ | `metrics.js` |
| NFR-OBS-03 | Logs/metrics shall be shippable to a SIEM/monitoring stack. | S | ◑ | feed/forward exist; aggregation is an operator step |
| NFR-OBS-04 | Distributed tracing shall be available. | C | ○ | candidate |

### 5.8 Maintainability & delivery (NFR-MNT)

| ID | Requirement | Pri | Status | Source |
|----|-------------|-----|--------|--------|
| NFR-MNT-01 | The API shall be organized into per-domain route modules with extracted auth/authz/storage/leader/rate-limit concerns. | M | ✅ | `src/routes/*`, `authz.js` etc. |
| NFR-MNT-02 | The frontend shall be decomposed into domain component modules. | S | ✅ | `components/*.jsx` (app.jsx 2,613→~700 lines) |
| NFR-MNT-03 | CI shall gate on lint, unit+integration tests (real Postgres), coverage thresholds, security scans, and a controls-compliance check. | M | ✅ | `ci.yml`, `security.yml` |
| NFR-MNT-04 | Test coverage shall meet the gate (≥70% lines / 60% branches / 65% functions). | M | ✅ | coverage gate; actual ~78/70/74 |
| NFR-MNT-05 | Dependencies shall be pinned (lockfiles, `npm ci`) and monitored (Dependabot, `npm audit`, Trivy). | M | ✅ | CI, Dependabot |
| NFR-MNT-06 | An automated deployment pipeline (CD) shall exist. | S | ○ | deferred to Azure |
| NFR-MNT-07 | The frontend shall be TypeScript. | C | ○ | candidate (currently JS) |

### 5.9 Usability & accessibility (NFR-USE)

| ID | Requirement | Pri | Status | Source |
|----|-------------|-----|--------|--------|
| NFR-USE-01 | The UI shall offer light and dark themes with legible contrast in both. | S | ✅ | `_tokens.css`, curated dark palette |
| NFR-USE-02 | Interactive controls shall have accessible labels and visible keyboard focus. | S | ◑ | toggle has aria-label; broader a11y audit pending |
| NFR-USE-03 | Errors shall be explained in user terms with next steps. | S | ✅ | `errors.js`, `TROUBLESHOOTING.md` |
| NFR-USE-04 | Idle sessions shall time out to protect unattended screens. | M | ✅ | 15-min idle logout |

### 5.10 Compatibility & portability (NFR-CMP)

| ID | Requirement | Pri | Status | Source |
|----|-------------|-----|--------|--------|
| NFR-CMP-01 | The system shall run on Docker Compose on a Windows VM, with Azure-native (Container Apps + managed PG + Blob + Key Vault) as the target. | M | ✅/○ | ADR-117; Azure deferred |
| NFR-CMP-02 | Capabilities shall be expressed product-neutrally (ABBs) so realizations can be swapped without re-architecture. | S | ✅ | `ARCHITECTURE-BUILDING-BLOCKS.md` |

### 5.11 Compliance (NFR-CMPL)

| ID | Requirement | Pri | Status | Source |
|----|-------------|-----|--------|--------|
| NFR-CMPL-01 | Controls shall be expressed as data and their coverage proven deterministically in CI (ISO 27001 · NIST CSF · GDPR · Zero Trust · MITRE ATT&CK). | M | ✅ | `compliance/controls.json`, `report.mjs`, `security.yml` |
| NFR-CMPL-02 | AI-specific frameworks (ISO 42001, EU AI Act, NIST AI RMF) shall be assessed and documented as applicable/N-A. | S | ✅ | documented N/A (no AI), `SECURITY-FRAMEWORKS.md` |
| NFR-CMPL-03 | A Statement of Applicability and Zero-Trust pillar write-up shall be adopted. | S | ○ | candidate |

---

## 6. Candidate / future requirements (CR)

Deferred by choice or pending an operator/organizational action. Sourced from
ADR deferrals, `NEXT-STEPS.md`, and the evaluation's open items.

| ID | Candidate requirement | Rationale / trigger |
|----|-----------------------|---------------------|
| CR-01 | Enforce MFA / Conditional Access | Biggest access control; lives in Entra — enable org-side |
| CR-02 | Enable at-rest encryption (BitLocker/CMK) + `PGSSL=require` | GDPR Art. 32; supported, off by default |
| CR-03 | Azure migration: IaC + CD pipeline + managed PostgreSQL (PITR) + private endpoints + HA edge + Key Vault | Absorbs CD, HA, PITR, at-rest, secrets in one move (ADR-117) |
| CR-04 | Move secrets to Key Vault + Managed Identity | Code already supports `DefaultAzureCredential` (T7 gap) |
| CR-05 | Adopt GDPR artefacts (ROPA/DPIA/notice) with DPO sign-off | Drafted from real behaviour; need review |
| CR-06 | Incident-response + breach runbook (IR-01 / GDPR-04) | DR exists; security IR does not yet |
| CR-07 | Zero-Trust pillar write-up + ISO SoA adoption | Compliance maturation (NFR-CMPL-03) |
| CR-08 | Directory-group approvers with **dynamic** (non-frozen) membership | Deliberately not built; snapshot chosen (ADR-120-c/d) |
| CR-09 | Optional separation-of-duties toggle (exclude submitter from approving) | Today a configuration guideline (approval abuse-case A-1) |
| CR-10 | Cryptographically signed approvals/attestations | Deferred; append-only + token identity matches current evidence model |
| CR-11 | Cross-device (server-side, per-Entra-account) theme persistence | Today per-device via `localStorage` (FR-UX-02) |
| CR-12 | Frontend migration to TypeScript | NFR-MNT-07 |
| CR-13 | Distributed tracing + SIEM alerting wiring | NFR-OBS-03/04 |
| CR-14 | Load/performance testing + broader UI end-to-end tests | NFR-PRF-04; UI e2e minimal |
| CR-15 | Broader accessibility (WCAG) audit and remediation | NFR-USE-02 |

---

## 7. Personas & representative user stories

Concise, app-wide stories (the approval workflow has a full set in
[`approval-workflow/USER-STORIES.md`](approval-workflow/USER-STORIES.md)).

- **Employee** — *"So I stay compliant, I want to see exactly which policies I must acknowledge and complete any required knowledge check, then record my acknowledgement."* (FR-ACK, FR-QIZ)
- **Employee** — *"I want to switch the portal to dark mode and have it remember my choice, so it's comfortable on my screen."* (FR-UX-01/02/03)
- **Manager** — *"I want a dashboard of my team's outstanding obligations and the ability to nudge them, so my area stays compliant."* (FR-RPT-02, FR-NOT-03)
- **Manager** — *"I want to upload and target a training to my team without touching others' content."* (FR-TRN)
- **Administrator** — *"I want a policy to be authorised by the right people, in order, before employees ever see it — with a tamper-evident record."* (FR-APR, FR-POL-06)
- **Administrator** — *"I want to define a standard sign-off chain once and apply it to many policies."* (FR-APR-10)
- **Approver** — *"I want a single place showing what awaits my decision, and to approve/reject with a comment."* (FR-APR-06/11)
- **DPO / Auditor** — *"I want to export everything held about a person, and prove control coverage and who-did-what."* (FR-DSR-01, FR-AUD, NFR-CMPL-01)
- **Operator** — *"I want scheduled off-host backups, health/readiness probes, and a rehearsed restore."* (FR-BKP, FR-OBS, NFR-AVL-03)

---

## 8. Traceability

- **Requirements → decisions:** ADR-101…120 in `ARCHITECTURE-AND-DECISIONS.md`.
- **Requirements → capabilities:** ABBs/SBBs in `ARCHITECTURE-BUILDING-BLOCKS.md` (B1–B11, D1–D8, A1–A14, T1–T8) and `approval-workflow/BUILDING-BLOCKS.md` (AW-1…AW-7).
- **Requirements → tests:** API unit+integration (`apps/api/test/**`), web (`apps/web/test/**`), docker-compose smoke; approval coverage matrix in `approval-workflow/USER-STORIES.md §5`.
- **Requirements → maturity:** scorecard in `APPLICATION-EVALUATION.md`.

_Status legend: ✅ implemented · ◑ partial (operator/org action to complete) · ○ planned/candidate._
