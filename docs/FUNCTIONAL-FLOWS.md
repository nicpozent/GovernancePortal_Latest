# Governance Portal — Functional Flows

A functional, **user-perspective** view of the Birgma Governance Portal presented as
flow diagrams in three views: **system & data flows**, **user journeys**
(persona → goal), and **software-development interaction**. Each entry shows a live
Mermaid diagram; the self-contained, air-gapped gallery
([`flows-gallery.html`](flows-gallery.html)) renders every diagram as inline SVG for
offline viewing. For the technical request path see
[`request-sequence.mmd`](request-sequence.mmd); for endpoints see [`LLD.md`](LLD.md);
for requirements see [`REQUIREMENTS.md`](REQUIREMENTS.md).

---

## Personas & roles

| Persona | Sees | Primary goal |
|---|---|---|
| **Employee** | Their assigned policies, trainings, quizzes | Stay compliant — read & acknowledge |
| **Manager** | Their team's compliance + own trainings | Keep the team compliant |
| **Administrator** | Everything: authoring, groups, sync, reports, integrations | Publish & govern; run the platform |
| **Approver** | Items awaiting their decision | Sign off before publication |
| **DPO / Auditor** | Audit trail, DSAR export | Evidence & data-subject rights |
| **System / Scheduler** | — (unattended) | Reminders, sync, backups |

Roles come from Entra app roles; the SPA shows an **Employee / Manager / Admin** view
switch for users entitled to more than one. Authorization is enforced **server-side**
on every request — the client is never a security boundary.

## Feature catalogue

| Area | Feature | Who | Flow |
|---|---|---|---|
| Identity | SSO sign-in, role-view switch, 15-min idle logout | All | `01` |
| Policy lifecycle | Create/edit/version/archive; SharePoint document source | Admin | `02`, `07` |
| Approval workflow | Ordered steps (all/any/quorum), group approvers, templates | Admin/Approver | `03`, `user-05` |
| Acknowledgement | Binding, append-only signature + certificate | Employee | `04`, `user-01` |
| Knowledge check | Server-graded quiz, quiz-gated signing | Employee | `04` |
| Targeting | Groups, directory-group mapping, effective membership | Admin | `05` |
| Directory sync | Least-privilege Entra/Graph import (assigned only) | Admin/System | `06` |
| Manager trainings | Upload & assign training material; nudges | Manager | `user-03` |
| Reporting | Dashboards (overall/dept/group), drill-down, CSV export | Admin/Manager | `09` |
| Notifications | Escalating reminder ladder; manual nudges | System/Manager | `08` |
| Audit | Immutable audit log; pull/push feed | Admin/Auditor | `10` |
| Data protection | DSAR export, evidence-preserving erasure, retention | Admin/DPO | `11`, `user-07` |
| Operations | Backups, disaster recovery, scheduled jobs | Admin/System | `12`, `13` |
| Observability | Metrics, health, structured logs | Admin/System | `14` |

---

# Flow index

## System & data flows
- [Application map & navigation](#00-app-map)
- [Authentication & RBAC gate](#01-auth-rbac)
- [Policy lifecycle — author → version → archive](#02-policy-lifecycle)
- [Approval workflow — submit → decide → publish](#03-approval)
- [Acknowledgement + knowledge check](#04-acknowledge)
- [Targeting — groups, mapping & effective membership](#05-targeting)
- [Directory sync — least-privilege Entra/Graph](#06-directory-sync)
- [Document source & preview (SharePoint)](#07-documents)
- [Reminder ladder — escalating notifications](#08-reminders)
- [Reporting & dashboards roll-up](#09-reporting)
- [Immutable audit log + pull/push feed](#10-audit)
- [GDPR data-subject rights (DSAR / erasure / retention)](#11-gdpr)
- [Backup & disaster recovery](#12-backup-dr)
- [Leader election & scheduled jobs](#13-scheduler)
- [Observability — metrics, health, logs](#14-observability)

## User journeys
- [Employee — acknowledge a policy (quiz-gated)](#user-01-employee-ack)
- [Employee — outstanding & re-sign on new version](#user-02-employee-outstanding)
- [Manager — team compliance, trainings & nudges](#user-03-manager-team)
- [Administrator — onboard & publish a policy](#user-04-admin-publish)
- [Approver — decide (approve / reject / request changes)](#user-05-approver-decide)
- [Administrator — groups, directory mapping & sync](#user-06-admin-groups)
- [DPO / Auditor — data-subject rights & audit export](#user-07-dpo-audit)

## Software-development interaction
- [Change lifecycle — branch → PR → CI → merge](#dev-01-change-lifecycle)
- [CI pipeline — the gating jobs](#dev-02-ci-pipeline)
- [Controls-as-code compliance gate](#dev-03-controls-gate)
- [Test strategy — unit → integration → smoke](#dev-04-test-strategy)
- [Local dev loop](#dev-05-local-dev)
- [Build & air-gapped deploy](#dev-06-build-deploy)
- [Runtime topology (component interaction)](#dev-07-runtime-topology)
- [Database migrations & append-only grants](#dev-08-migrations)
- [Dependency currency (Dependabot + audit/Trivy)](#dev-09-dependencies)

---

# System & data flows


<a id="00-app-map"></a>

## Application map & navigation

```mermaid
graph LR
  APP(["Governance Portal"]):::start
  APP --> EMP["Employee"]
  APP --> MGR["Manager"]
  APP --> ADM["Administrator"]
  EMP --> E1["My policies · My signatures<br/>Reader · quizzes · certificates"]
  MGR --> M1["Team dashboard · Trainings<br/>Reminders"]
  ADM --> A1["Dashboard · Policy library · Approvals<br/>Employees · Groups & access"]
  ADM --> A2["Audit log · Reports<br/>Integrations · Backups"]
  classDef start fill:#2a4c8f,stroke:#22407a,color:#ffffff,font-weight:600;
```


<a id="01-auth-rbac"></a>

## Authentication & RBAC gate

```mermaid
graph TD
  U(["User opens the portal"]):::start --> MSAL["MSAL sign-in (PKCE) → Entra ID"]
  MSAL --> TOK["Bearer access token"]
  TOK --> API["Call /api/*"]
  API --> V{"Validate token<br/>signature · issuer · audience · tenant · scope (RS256)"}
  V -- app-only / invalid --> D1["401 Unauthorized"]:::deny
  V -- valid user token --> RBAC{"Server authorization<br/>role · ownership · effective group"}
  RBAC -- deny --> D2["403 Forbidden"]:::deny
  RBAC -- allow --> OK(["200 + data"]):::start
  classDef start fill:#2a4c8f,stroke:#22407a,color:#ffffff,font-weight:600;
  classDef deny fill:#f7dede,stroke:#b23a3a,color:#7a1f1f;
```


<a id="02-policy-lifecycle"></a>

## Policy lifecycle — author → version → archive

```mermaid
graph LR
  N(["New policy"]):::start --> SRC["Pick SharePoint document (Sites.Selected)"]
  SRC --> META["Set name · version · due date · owner"]
  META --> ASG["Assign to group(s) → effective audience"]
  ASG --> WF{"Approval workflow?"}
  WF -- no --> PUB["Publish (or mark approved externally)"]
  WF -- yes --> APR["Approval chain (see 03)"]
  APR --> PUB
  PUB --> VIS["Visible to assigned population"]
  VIS --> NV["Edit to a NEW version → re-acknowledge required"]
  NV --> META
  classDef start fill:#2a4c8f,stroke:#22407a,color:#ffffff,font-weight:600;
```


<a id="03-approval"></a>

## Approval workflow — submit → decide → publish

Ordered **steps**; each step is satisfied by **all**, **any**, or a **quorum** of its
approvers (people and/or directory groups, frozen to members at submit). Every
decision is written to an append-only decision ledger.

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
  Published --> Draft: edit to a NEW version (re-approval)
  InReview --> Draft: withdraw
```


<a id="04-acknowledge"></a>

## Acknowledgement + knowledge check

```mermaid
graph TD
  O(["Open an assigned policy"]):::start --> R["In-app preview (read)"]
  R --> Q{"Quiz required?"}
  Q -- no --> SIGN["Type full name + confirm 'read & understood'"]
  Q -- yes --> TAKE["Take quiz (graded server-side)"]
  TAKE --> P{"Passed?"}
  P -- no --> RETRY["Review & retry"]:::deny
  RETRY --> TAKE
  P -- yes --> SIGN
  SIGN --> LEDGER["Write to append-only signature ledger<br/>(identity + version + timestamp)"]
  LEDGER --> CERT(["Acknowledged → printable certificate"]):::start
  classDef start fill:#2a4c8f,stroke:#22407a,color:#ffffff,font-weight:600;
  classDef deny fill:#f7dede,stroke:#b23a3a,color:#7a1f1f;
```


<a id="05-targeting"></a>

## Targeting — groups, mapping & effective membership

```mermaid
graph TD
  G(["Groups & access"]):::start --> T{"Targeting method"}
  T -- map directory group --> MAP["Map AD group → platform group"]
  T -- local group --> LOC["Create local group + add members"]
  MAP --> EFF["Effective membership = direct ∪ mapped"]
  LOC --> EFF
  EFF --> ASG["Assign policies / trainings to groups"]
  ASG --> AUD["Audience resolves per policy"]
  classDef start fill:#2a4c8f,stroke:#22407a,color:#ffffff,font-weight:600;
```


<a id="06-directory-sync"></a>

## Directory sync — least-privilege Entra/Graph

```mermaid
sequenceDiagram
  autonumber
  actor A as Admin / Scheduler
  participant API as Portal API
  participant G as Microsoft Graph
  A->>API: Sync now
  API->>G: Read principals ASSIGNED to the app (least privilege)
  G-->>API: Users + groups (5 attributes only)
  API->>API: Upsert users & groups
  API->>API: Deactivate leavers (never hard-delete)
  API-->>A: Sync summary (added / updated / deactivated)
```


<a id="07-documents"></a>

## Document source & preview (SharePoint)

```mermaid
graph LR
  B(["Browse SharePoint (Sites.Selected)"]):::start --> PICK["Pick the governed document"]
  PICK --> TYPE{"File type"}
  TYPE -- PDF --> PREV["Inline preview"]
  TYPE -- Office --> CONV["Convert to PDF → preview"]
  TYPE -- unavailable --> FALL["Download / open in SharePoint"]:::deny
  PREV --> ACK["Available to read & acknowledge (see 04)"]
  CONV --> ACK
  classDef start fill:#2a4c8f,stroke:#22407a,color:#ffffff,font-weight:600;
  classDef deny fill:#f7dede,stroke:#b23a3a,color:#7a1f1f;
```


<a id="08-reminders"></a>

## Reminder ladder — escalating notifications

```mermaid
graph LR
  S(["Scheduler tick"]):::start --> DUE{"Where in the ladder?"}
  DUE --> A["Assigned"]
  DUE --> D["Due − 20 / 15 / 7 / 1 days"]
  DUE --> O["Overdue"]:::deny
  A --> ONCE["Send at most once per person/version (idempotent)"]
  D --> ONCE
  O --> ONCE
  ONCE --> MAIL["Microsoft Graph mail"]
  classDef start fill:#2a4c8f,stroke:#22407a,color:#ffffff,font-weight:600;
  classDef deny fill:#f7dede,stroke:#b23a3a,color:#7a1f1f;
```


<a id="09-reporting"></a>

## Reporting & dashboards roll-up

```mermaid
graph TD
  SIG["Signature ledger"] --> AGG["Aggregate by scope"]
  AGG --> OV["Overall"]
  AGG --> DP["By department"]
  AGG --> GP["By group"]
  OV --> DR["Drill-down: who has / hasn't signed"]
  DP --> DR
  GP --> DR
  DR --> CSV(["CSV export for auditors"]):::start
  AGG --> NA["Unassigned documents read 'not assigned' (not 0%)"]
  classDef start fill:#2a4c8f,stroke:#22407a,color:#ffffff,font-weight:600;
```


<a id="10-audit"></a>

## Immutable audit log + pull/push feed

```mermaid
graph LR
  ACT(["Admin action / decision"]):::start --> LOG["Append to immutable audit log"]
  LOG --> VIEW["Browse in-app"]
  LOG --> PULL["Pull feed (query off-host)"]
  LOG --> PUSH["Push feed (forward to SIEM)"]
  LOG -. "DB grants prevent update/delete" .-> APPEND["Append-only enforced"]
  classDef start fill:#2a4c8f,stroke:#22407a,color:#ffffff,font-weight:600;
```


<a id="11-gdpr"></a>

## GDPR data-subject rights (DSAR / erasure / retention)

```mermaid
graph TD
  DSR(["Data-subject request"]):::start --> T{"Type"}
  T -- Access --> EXP["DSAR export — full per-subject package (admin-only, audited)"]
  T -- Erasure --> ERA["Pseudonymise / redact — ledger rows preserved for integrity"]
  T -- Retention --> PUR["Purge data past the configured window"]
  classDef start fill:#2a4c8f,stroke:#22407a,color:#ffffff,font-weight:600;
```


<a id="12-backup-dr"></a>

## Backup & disaster recovery

```mermaid
graph LR
  DB[("PostgreSQL")] --> BK["Daily backup (DB + uploads)"]
  BK --> OFF["Off-host, access-controlled storage"]
  OFF --> DR{"Disaster?"}
  DR -- yes --> REST["Restore per DISASTER-RECOVERY.md (RTO ≤ 4h)"]
  DR -- no --> KEEP["Retain per policy"]
  REST --> VERIFY(["Rehearsed restore verified"]):::start
  classDef start fill:#2a4c8f,stroke:#22407a,color:#ffffff,font-weight:600;
```


<a id="13-scheduler"></a>

## Leader election & scheduled jobs

```mermaid
graph TD
  INST(["Instances (1..N)"]):::start --> LOCK{"Postgres advisory lock"}
  LOCK -- acquired --> LEADER["Leader runs timers"]
  LOCK -- not acquired --> FOLLOW["Followers idle"]
  LEADER --> J1["Reminder ladder (08)"]
  LEADER --> J2["Directory sync (06)"]
  LEADER --> J3["Daily backup (12)"]
  J1 -. "failures never block user actions" .-> SAFE["Isolated"]
  classDef start fill:#2a4c8f,stroke:#22407a,color:#ffffff,font-weight:600;
```


<a id="14-observability"></a>

## Observability — metrics, health, logs

```mermaid
graph LR
  API(["Portal API"]):::start --> LOG["Structured pino logs<br/>correlation ids · redaction"]
  API --> MET["/metrics (Prometheus — RED + runtime)"]
  API --> HZ["/healthz (liveness)"]
  API --> RZ["/readyz (DB-checked readiness)"]
  LOG --> SHIP["Optional log shipping → SIEM"]
  MET --> ALERT["Alerting (operator step)"]
  classDef start fill:#2a4c8f,stroke:#22407a,color:#ffffff,font-weight:600;
```


---

# User journeys


<a id="user-01-employee-ack"></a>

## Employee — acknowledge a policy (quiz-gated)

```mermaid
graph LR
  U(["Employee"]):::start --> A["Sign in (Microsoft)"]
  A --> B["My policies — assigned & outstanding"]
  B --> C["Open a policy → in-app preview"]
  C --> D["Take quiz if required → pass (server-graded)"]
  D --> E["Type name + confirm → sign"]
  E --> F(["Acknowledged → printable certificate"]):::start
  classDef start fill:#2a4c8f,stroke:#22407a,color:#ffffff,font-weight:600;
```


<a id="user-02-employee-outstanding"></a>

## Employee — outstanding & re-sign on new version

```mermaid
graph LR
  U(["Employee"]):::start --> A["My signatures"]
  A --> B{"Status?"}
  B -- outstanding --> C["Read & sign (user-01)"]
  B -- signed --> D["Nothing to do"]
  B -- new version --> E["Re-acknowledge required"]:::deny
  E --> C
  classDef start fill:#2a4c8f,stroke:#22407a,color:#ffffff,font-weight:600;
  classDef deny fill:#f7dede,stroke:#b23a3a,color:#7a1f1f;
```


<a id="user-03-manager-team"></a>

## Manager — team compliance, trainings & nudges

```mermaid
graph LR
  U(["Manager"]):::start --> A["Switch to Manager view"]
  A --> B["Team dashboard: who is outstanding"]
  B --> C{"Action?"}
  C -- upload training --> T["Upload file → assign to my groups → 'reaches N people'"]
  C -- send reminders --> R["Run reminders (idempotent, config-gated)"]
  C -- review --> B
  classDef start fill:#2a4c8f,stroke:#22407a,color:#ffffff,font-weight:600;
```

Managers only ever see and act on **their own team** (functional-manager reports ∪
directory-manager matches) and their **own** trainings.


<a id="user-04-admin-publish"></a>

## Administrator — onboard & publish a policy

```mermaid
graph LR
  U(["Administrator"]):::start --> A["Policy library → New policy"]
  A --> B["Browse SharePoint → pick document"]
  B --> C["Set name, version, due date, owner"]
  C --> D["Assign to group(s) → effective audience"]
  D --> E{"Use approval workflow?"}
  E -- no --> G["Publish (or mark approved externally)"]
  E -- yes --> F["Configure approvers → Submit (03)"]
  F --> G
  G --> H(["Visible to assigned population"]):::start
  classDef start fill:#2a4c8f,stroke:#22407a,color:#ffffff,font-weight:600;
```


<a id="user-05-approver-decide"></a>

## Approver — decide (approve / reject / request changes)

```mermaid
graph LR
  U(["Approver"]):::start --> A["Approvals — items awaiting me"]
  A --> B["Open item → read policy + context"]
  B --> C{"Decision"}
  C -- approve --> D["Step satisfied → advance / final approve"]
  C -- request changes --> E["Back to owner (+comment)"]:::deny
  C -- reject --> F["Rejected (+comment)"]:::deny
  D --> G(["Decision written to append-only ledger"]):::start
  E --> G
  F --> G
  classDef start fill:#2a4c8f,stroke:#22407a,color:#ffffff,font-weight:600;
  classDef deny fill:#f7dede,stroke:#b23a3a,color:#7a1f1f;
```

Employees cannot see a policy while it is under review — only owner, admin and
configured approvers can (so they can act).


<a id="user-06-admin-groups"></a>

## Administrator — groups, directory mapping & sync

```mermaid
graph LR
  U(["Administrator"]):::start --> A["Employees → Sync now (06)"]
  A --> B["Groups & access"]
  B --> C{"Targeting method"}
  C -- map --> D["Map AD group → platform group"]
  C -- local --> E["Create local group + members"]
  D --> F["Effective membership (05)"]
  E --> F
  F --> G(["Assign policies/trainings to groups"]):::start
  classDef start fill:#2a4c8f,stroke:#22407a,color:#ffffff,font-weight:600;
```


<a id="user-07-dpo-audit"></a>

## DPO / Auditor — data-subject rights & audit export

```mermaid
graph LR
  U(["DPO / Auditor"]):::start --> A{"Task"}
  A -- data-subject request --> B["DSAR export / erasure / retention (11)"]
  A -- assurance --> C["Browse immutable audit log (10)"]
  C --> D["Export CSV / consume pull-push feed"]
  B --> E(["Defensible evidence package"]):::start
  D --> E
  classDef start fill:#2a4c8f,stroke:#22407a,color:#ffffff,font-weight:600;
```


---

# Software-development interaction


<a id="dev-01-change-lifecycle"></a>

## Change lifecycle — branch → PR → CI → merge

```mermaid
graph LR
  I(["Change / issue"]):::start --> B["Branch (claude/…)"]
  B --> IMP["Implement · ADR if architectural"]
  IMP --> PR["Open PR"]
  PR --> CI{"CI green?"}
  CI -- no --> FIX["Fix → push"]:::deny
  FIX --> CI
  CI -- yes --> M(["Fast-forward merge to main"]):::start
  classDef start fill:#2a4c8f,stroke:#22407a,color:#ffffff,font-weight:600;
  classDef deny fill:#f7dede,stroke:#b23a3a,color:#7a1f1f;
```


<a id="dev-02-ci-pipeline"></a>

## CI pipeline — the gating jobs

```mermaid
graph TD
  P(["Push / Pull request"]):::start --> J{"Workflows — parallel"}
  J --> CI["ci: lint · unit · integration (real Postgres) · coverage · web build"]
  J --> SEC["security: gitleaks · Trivy · semgrep · controls-compliance gate"]
  J --> SMK["smoke: docker-compose end-to-end"]
  CI --> G{"All required green?"}
  SEC --> G
  SMK --> G
  G -- yes --> OK(["Mergeable"]):::start
  G -- no --> BL["Blocked"]:::deny
  classDef start fill:#2a4c8f,stroke:#22407a,color:#ffffff,font-weight:600;
  classDef deny fill:#f7dede,stroke:#b23a3a,color:#7a1f1f;
```


<a id="dev-03-controls-gate"></a>

## Controls-as-code compliance gate

```mermaid
graph LR
  CJ["compliance/controls.json"] --> RPT["report.mjs --check"]
  RPT --> V{"Schema + coverage valid?"}
  V -- no --> FAIL["Fail CI — fix the catalogue"]:::deny
  V -- yes --> OK(["Gate passes"]):::start
  CJ --> MD["report.mjs --md → COVERAGE.md (SoA snapshot)"]
  classDef start fill:#2a4c8f,stroke:#22407a,color:#ffffff,font-weight:600;
  classDef deny fill:#f7dede,stroke:#b23a3a,color:#7a1f1f;
```


<a id="dev-04-test-strategy"></a>

## Test strategy — unit → integration → smoke

```mermaid
graph TD
  U["Unit — node:test (API) · vitest (web)"] --> I["Integration — against a real Postgres"]
  I --> E["Smoke — docker-compose end-to-end"]
  E --> COV(["Coverage floors gated in CI<br/>(lines ≥70 · branches ≥60 · functions ≥65)"]):::start
  classDef start fill:#2a4c8f,stroke:#22407a,color:#ffffff,font-weight:600;
```


<a id="dev-05-local-dev"></a>

## Local dev loop

```mermaid
graph LR
  D(["Developer"]):::start --> A["docker compose up (db) + api + web"]
  A --> B{"Auth mode"}
  B -- dev --> C["Local roles / stubbed identity"]
  B -- real --> E["Entra SSO + Graph/SharePoint"]
  C --> F["Iterate → tests → lint"]
  E --> F
  classDef start fill:#2a4c8f,stroke:#22407a,color:#ffffff,font-weight:600;
```


<a id="dev-06-build-deploy"></a>

## Build & air-gapped deploy

```mermaid
graph LR
  SRC(["Source (downloaded, no egress)"]):::start --> BUILD["docker compose build"]
  BUILD --> IMG["web · api · db images"]
  IMG --> ENV["deploy/.env + certs/ (self-signed or supplied)"]
  ENV --> UP["docker compose up -d"]
  UP --> HC{"Healthchecks pass?"}
  HC -- yes --> LIVE(["nginx edge: SPA · /api · TLS"]):::start
  HC -- no --> DIAG["Troubleshoot (.env in deploy/, LF endings, TLS)"]:::deny
  classDef start fill:#2a4c8f,stroke:#22407a,color:#ffffff,font-weight:600;
  classDef deny fill:#f7dede,stroke:#b23a3a,color:#7a1f1f;
```


<a id="dev-07-runtime-topology"></a>

## Runtime topology (component interaction)

```mermaid
graph LR
  BR(["Browser · React SPA"]):::start --> NG["nginx (TLS, CSP, same-origin)"]
  NG --> API["Node/Express API · /api"]
  API --> DB[("PostgreSQL 16")]
  API --> GR["Microsoft Graph (mail · directory)"]
  API --> SP["SharePoint (Sites.Selected)"]
  BR -. "MSAL bearer" .-> ENTRA["Entra ID (SSO)"]
  API -. "validate token" .-> ENTRA
  classDef start fill:#2a4c8f,stroke:#22407a,color:#ffffff,font-weight:600;
```


<a id="dev-08-migrations"></a>

## Database migrations & append-only grants

```mermaid
graph LR
  M(["migration_0NN_*.sql"]):::start --> RUN["migrate.js (tracked, transactional)"]
  RUN --> APPLY{"Applied already?"}
  APPLY -- yes --> SKIP["Skip"]
  APPLY -- no --> TX["Apply in a transaction → record"]
  TX --> GRANT["docker-grants.sql: revoke UPDATE/DELETE on ledgers"]
  GRANT --> AO(["Append-only enforced at the DB"]):::start
  classDef start fill:#2a4c8f,stroke:#22407a,color:#ffffff,font-weight:600;
```


<a id="dev-09-dependencies"></a>

## Dependency currency (Dependabot + audit/Trivy)

```mermaid
graph LR
  DB2(["Dependabot (grouped)"]):::start --> PR["Update PR"]
  PR --> AUD{"npm audit + Trivy gate"}
  AUD -- High/Critical --> BLOCK["Blocked → pin / override"]:::deny
  AUD -- clean --> CI["CI green"]
  CI --> MG(["Merge — lockfiles + npm ci"]):::start
  classDef start fill:#2a4c8f,stroke:#22407a,color:#ffffff,font-weight:600;
  classDef deny fill:#f7dede,stroke:#b23a3a,color:#7a1f1f;
```


---

## Cross-cutting experience

- **Single sign-on** — one Microsoft sign-in; the API validates every request; no
  separate password.
- **Role-view switch** — users entitled to Manager/Admin can switch views; each view
  is re-authorised server-side.
- **Document preview** — PDFs render inline; Office files convert to PDF; a
  download/open-in-SharePoint fallback appears when preview is unavailable.
- **Idle logout** — automatic sign-out after 15 minutes of inactivity.
- **Theming** — light/dark toggle, remembered per device, defaulting to the OS setting.
- **Friendly errors** — server error codes map to plain-language messages (~32-code
  catalogue) rather than raw failures.

## Golden path (end-to-end)

Admin picks a SharePoint document → assigns it to a group → routes it through approval
→ publishes → assigned employees are reminded → each reads it, passes the quiz, and
signs → the manager and admin watch compliance reach 100% → an auditor exports the CSV
and the immutable audit trail. The runtime version of this path is
[`request-sequence.mmd`](request-sequence.mmd).

## References

[`REQUIREMENTS.md`](REQUIREMENTS.md) · [`USER-STORIES.md`](USER-STORIES.md) ·
[`HLD.md`](HLD.md) · [`LLD.md`](LLD.md) · [`USER-GUIDE.md`](USER-GUIDE.md) ·
approval detail in [`approval-workflow/`](approval-workflow/README.md) ·
offline gallery [`flows-gallery.html`](flows-gallery.html) ·
diagrams [`request-sequence.mmd`](request-sequence.mmd) /
[`architecture-diagram.mmd`](architecture-diagram.mmd).
