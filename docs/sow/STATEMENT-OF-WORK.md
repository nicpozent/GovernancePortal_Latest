# Statement of Work — Birgma Governance Portal

> **How to use this document.** The scope, deliverables, acceptance criteria and
> security/compliance commitments below are grounded in the delivered system.
> Fields in **[brackets]** / **‹chevrons›** — parties, dates, effort, commercials and
> general legal terms — are for the contracting parties (and legal) to complete; they
> are intentionally not pre-filled. General legal terms (liability, indemnities,
> termination, dispute resolution) are governed by the MSA (§21), not restated here.

| Field | Value |
|---|---|
| **Project** | Birgma Governance Portal — policy governance, attestation & compliance evidence |
| **Client / Sponsor** | [Birgma / Biltema — sponsor name] |
| **Supplier / Delivery** | [Delivery team / vendor] |
| **Repository** | `nicpozent/GovernancePortal_Latest` |
| **Prepared for** | nicolas.pozza@birgma.com |
| **SoW version** | 1.2 (draft, for signature) · [date] |
| **Effective period** | [start] – [end] |
| **Executed under** | Master Services Agreement ‹MSA reference / date› (§21) |

---

## 1. Background & objectives

The Birgma Governance Portal is a web application that distributes governance
documents, collects binding acknowledgements (optionally gated on a knowledge check),
routes documents through a pre-publication approval chain, targets obligations at
people via groups, and produces tamper-evident compliance evidence — with identity
federated to **Microsoft Entra ID**. It replaces ad-hoc distribution and spreadsheet
tracking with a controlled lifecycle over an append-only evidence ledger, satisfying
ISO 27001 / GDPR obligations in a defensible, auditable way.

Primary objectives:

1. Federated single sign-on and least-privilege, server-authoritative authorisation.
2. A controlled **policy lifecycle** with versioning and pre-publication approval.
3. **Binding acknowledgement** bound to identity + version + time, optionally gated
   on a **knowledge check**.
4. **Targeting** of obligations via groups and least-privilege directory sync.
5. **Assurance**: live dashboards, reporting/export, and a tamper-evident audit trail.
6. **Compliance by design**: GDPR data-subject rights and a controls-as-code posture.
7. **Portability**: container-first, ready for an Azure-native target.

## 2. Scope of work

### 2.1 In-scope work packages
| WP | Work package | Summary |
|----|--------------|---------|
| WP1 | Identity & access | Entra SSO (MSAL/PKCE); RS256 token validation (issuer/audience/tenant/scope); app roles; three-layer authorization (role · ownership · effective-group-membership); idle logout |
| WP2 | Policy lifecycle & documents | Author/version/archive policies; SharePoint document source (Sites.Selected); in-app document preview |
| WP3 | Acknowledgement & knowledge checks | Append-only signature ledger; server-graded quizzes; quiz-gated signing; printable certificate |
| WP4 | Pre-publication approval workflow | Ordered steps with all/any/quorum rules; person + directory-group approvers; reusable templates; append-only decision ledger; new-version re-approval |
| WP5 | Targeting: groups & directory sync | Platform/local groups; directory-group mapping; effective-membership rollup; least-privilege Entra/Graph sync (assigned principals only) |
| WP6 | Manager delegation & trainings | Team-scoped dashboards; manager training uploads; team reminders |
| WP7 | Reporting & assurance | Compliance dashboards (overall / by department / by group), drill-down, CSV export; immutable audit log; pull/push audit feed |
| WP8 | Notifications | Scheduled, idempotent reminder ladder (assigned → due → overdue) via Microsoft Graph mail |
| WP9 | Data protection (GDPR) | Per-subject DSAR export; evidence-preserving erasure; retention purge; ROPA/DPIA/privacy notice |
| WP10 | Security & compliance posture | Controls-as-code catalogue (ISO 27001 / NIST CSF / GDPR / Zero Trust / MITRE ATT&CK); STRIDE + ATT&CK threat model; CI security scanning |
| WP11 | Reliability & operations | Docker Compose stack; healthchecks; leader-locked schedulers; backup + rehearsed disaster recovery |
| WP12 | Documentation & hand-over | Architecture (HLD/LLD/ADRs/ABB-SBB), requirements, user & install guides, runbooks, diagrams |

### 2.2 Out of scope
- Hosting, network, and identity-tenant administration beyond configuration guidance
  (Entra tenant, VMware/Windows host, corporate network, firewalls).
- Organisation-side security controls (MFA/Conditional Access enablement, at-rest
  disk encryption, SIEM ingestion) — the application supports them; enabling them is
  an operator/IT action.
- Data migration from legacy systems (unless added by change request).
- The Azure-native production migration (designed for; delivered under a separate SoW).
- Any AI/ML capability (explicitly not applicable — see `SECURITY-FRAMEWORKS.md`).

### 2.3 User roles & journeys

Authorization is enforced **server-side** on every request; the SPA's role-view
switch is a convenience, not a security boundary. Each role's primary journey is
captured as a flow diagram in the flow package (see
[`FUNCTIONAL-FLOWS.md`](../FUNCTIONAL-FLOWS.md) and the offline gallery
[`flows-gallery.html`](../flows-gallery.html)).

| Role (enforced) | Primary journey | Flow |
|---|---|---|
| **Employee** | See assigned policies → read → pass quiz → acknowledge → certificate | [`user-01`](../FUNCTIONAL-FLOWS.md#user-01-employee-ack) (+ [`user-02`](../FUNCTIONAL-FLOWS.md#user-02-employee-outstanding)) |
| **Manager** | Team compliance dashboard; upload & assign trainings; send reminders | [`user-03`](../FUNCTIONAL-FLOWS.md#user-03-manager-team) |
| **Administrator** | Author/target/publish policies; groups & sync; dashboards; integrations; backups | [`user-04`](../FUNCTIONAL-FLOWS.md#user-04-admin-publish), [`user-06`](../FUNCTIONAL-FLOWS.md#user-06-admin-groups) |
| **Approver** | Decide items awaiting sign-off (approve / reject / request changes) | [`user-05`](../FUNCTIONAL-FLOWS.md#user-05-approver-decide) |
| **DPO / Auditor** | DSAR export; evidence-preserving erasure; audit trail & feed | [`user-07`](../FUNCTIONAL-FLOWS.md#user-07-dpo-audit) |
| **System / Scheduler** | Unattended reminders, directory sync, backups (leader-locked) | [`08`](../FUNCTIONAL-FLOWS.md#08-reminders), [`06`](../FUNCTIONAL-FLOWS.md#06-directory-sync), [`12`](../FUNCTIONAL-FLOWS.md#12-backup-dr) |

The flow package also documents the **system & data flows** (15) and
**software-development interaction flows** (9) — see the flow index.

## 3. Deliverables

| # | Deliverable | Form | Acceptance evidence |
|---|-------------|------|---------------------|
| D1 | Web application (SPA + API + database) | Running containerised stack | Builds & runs via `docker compose up --build -d`; healthy `/healthz`·`/readyz` |
| D2 | Source code + CI pipelines | Git repository | CI (lint/unit/integration/coverage), security (gitleaks/Trivy/semgrep + compliance gate), smoke e2e all green |
| D3 | Automated test suite | Code | Unit + integration (real Postgres) + docker-compose smoke; coverage gate (lines ≥70, branches ≥60, functions ≥65) |
| D4 | Architecture & design docs | Markdown | `HLD.md`, `LLD.md`, `ARCHITECTURE-AND-DECISIONS.md` (ADRs), ABB/SBB catalogue, diagrams |
| D5 | Requirements & user stories | Markdown | `REQUIREMENTS.md` (FR/NFR/TR), `USER-STORIES.md` |
| D6 | Security & compliance pack | Markdown + JSON | `THREAT-MODEL.md`, `controls.json` + `COVERAGE.md`, `ISO27001-SOA.md`, `ZERO-TRUST.md` |
| D7 | GDPR pack | Markdown | ROPA, DPIA, privacy notice, data-rights guide |
| D8 | Operations runbooks | Markdown | Install guide, disaster recovery, restore, reset, observability, migrations, TLS |
| D9 | User & functional documentation | Markdown + HTML | `USER-GUIDE.md`, `FUNCTIONAL-FLOWS.md` (+ offline gallery) |

## 4. Approach, methodology & delivery phases

- **Server-authoritative security.** The API is the authority for authorization
  (role · ownership · effective-group-membership); UI role checks are affordances only.
- **Append-only evidence.** Signatures, quiz results, approval decisions and the audit
  log are append-only, enforced at the database via grants.
- **Tested, gated, documented.** Every work package merges to `main` behind green CI
  with tests, updated docs, and no High/Critical security findings.
- **ADR-driven**, one-change-one-PR, each verified green in CI before a fast-forward
  merge.

Iterative delivery; each phase is independently shippable and CI-gated. (Phases
reflect the actual delivery history and forward plan; see the ADRs.)

| Phase | Focus | Status |
|-------|-------|--------|
| P0 — MVP | SSO, policy CRUD, acknowledgement ledger, dashboards | Delivered |
| P1 — Groups & targeting | First-class groups, directory mapping, effective membership | Delivered |
| P2 — Quizzes & trainings | Server-graded quizzes, manager trainings/uploads | Delivered |
| P3 — Assurance & audit | Reporting/export, immutable audit log, pull/push feed | Delivered |
| P4 — HA hardening | Leader-locked schedulers, shared rate-limit store, storage abstraction | Delivered |
| P5 — Approval workflow | Ordered steps (all/any/quorum), group approvers, templates, re-approval | Delivered (ADR-120) |
| P6 — Compliance-as-code & threat model | Controls catalogue, STRIDE + ATT&CK model, Zero-Trust/ISO SoA | Delivered |
| P7 — Dependency currency | Framework majors (React 19, Express 5, MSAL 5) + CI hygiene | Delivered |
| P8 — Azure-native migration | Key Vault + Managed Identity, managed Postgres (PITR), Blob, private networking, WAF | Planned (separate SoW) |

## 5. Technical architecture

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 8, react-router, `@azure/msal-browser`; inline theme tokens (light/dark) |
| Backend | Node.js 22, Express 5 (CommonJS); per-domain route modules; extracted auth/authz/storage/leader/rate-limit |
| Data | PostgreSQL 16; append-only signature/audit/quiz/decision ledgers via DB grants; tracked transactional migration runner |
| Identity | Entra ID SSO (MSAL, PKCE); RS256-pinned token validation (issuer/audience/tenant/scope); app-only rejected |
| Integrations | Microsoft Graph (mail, least-privilege directory); SharePoint document source (`Sites.Selected`) |
| Async / scheduling | In-process timers (reminders, sync, backup) with a Postgres advisory-lock leader election |
| Serving | nginx edge — TLS, security headers/CSP, `/api` reverse proxy, SPA fallback, same-origin |
| Observability | Structured pino logs + correlation ids + redaction; Prometheus `/metrics`; DB-checked `/readyz`; container healthchecks |
| Quality gates | ESLint; coverage floors; controls-as-code gate; gitleaks/Trivy/semgrep; docker-compose smoke e2e |

## 6. Milestones & acceptance criteria

| Milestone | Acceptance criteria |
|-----------|---------------------|
| M1 Functional | All in-scope features demonstrable against `REQUIREMENTS.md` (FR-*) and `USER-STORIES.md`; integration tests green |
| M2 Security | Threat model reviewed; controls-as-code `report.mjs --check` green; no High findings in `npm audit`/Trivy; secrets scan clean |
| M3 Operational | `docker compose` deployment per `INSTALL-GUIDE.md`; healthchecks pass; **DR restore rehearsed** per `DISASTER-RECOVERY.md` |
| M4 Compliance | ISO 27001 SoA populated; GDPR pack reviewed by [DPO]; audit trail verified |
| M5 Documentation & hand-over | D4–D9 delivered; knowledge-transfer session held |
| M6 Live sign-off | A real Entra interactive sign-in verified in [staging/production]; go-live approved by [sponsor] |

**Definition of Done (per work package):** code merged to `main` behind green CI;
tests for the behaviour; documentation updated; no High/Critical security findings.

## 7. Timeline & schedule

Phases P0–P7 are **delivered**. The remaining schedule covers acceptance, hand-over,
the live sign-off, and the optional Azure phase. Durations and dates are
**‹to be completed›** against the effective period.

| Activity | Duration | Depends on | Target |
|----------|----------|------------|--------|
| Build phases P0–P7 | complete | — | Delivered |
| Documentation & hand-over (D4–D9) | ‹N› wks | P0–P7 | ‹date› |
| Milestone acceptance M1–M5 | ‹N› wks | D1–D9 | ‹date› |
| Staging deploy + live Entra sign-off (M6) | ‹N› days | Client environment | ‹date› |
| Warranty period | ‹N› months | Final acceptance | ‹date› |
| P8 Azure migration (optional) | ‹N› wks | Separate SoW | On request |

> **Critical path.** Go-live (M6) depends on **client-side environment readiness** —
> the Entra app registrations + MFA, SharePoint `Sites.Selected` consent, and host/TLS
> — see §11 and §17 (DR-5).

## 8. Acceptance process & defect management

For each milestone the supplier submits the deliverable for acceptance with its
evidence (build, tests, demo). The client reviews within **‹N›** business days and
either accepts or rejects in writing, citing defects by severity.

| Severity | Definition | Effect on acceptance |
|----------|------------|----------------------|
| Critical | Core function unusable; data-integrity or security failure | Blocks acceptance; fix before re-submission |
| Major | Significant feature impaired; no reasonable workaround | Blocks acceptance |
| Minor | Cosmetic or low-impact; workaround exists | Tracked as a snag; does not block |

- The supplier remediates Critical/Major defects within **‹N›** business days and
  re-submits.
- **Deemed acceptance**: a deliverable is accepted if the client raises no
  Critical/Major defect within the review window, or on first productive use.
- Minor snags are logged and cleared during the warranty period (§16).

## 9. Roles & responsibilities (RACI)

| Activity | Delivery team | Client/IT | Sponsor | DPO |
|---|---|---|---|---|
| Build & test the application | R/A | C | I | I |
| Entra tenant + app registrations, MFA/CA | C | R/A | I | I |
| Host / network / TLS certificates | C | R/A | I | — |
| SharePoint site + Graph consent | C | R/A | I | — |
| Security & compliance artefacts | R/A | C | I | C |
| GDPR sign-off (ROPA/DPIA/notice) | C | C | I | R/A |
| Acceptance & go-live approval | C | C | R/A | C |

_R = Responsible · A = Accountable · C = Consulted · I = Informed. Names: [to complete]._

## 10. Governance & communication

| Forum | Cadence | Purpose / participants |
|-------|---------|------------------------|
| Delivery status | Weekly | Progress, risks, decisions, next steps — delivery lead + client PO |
| Milestone review | Per milestone | Demo + acceptance walk-through against §6/§8 criteria |
| Steering | ‹Monthly› | Scope, budget, risk escalation — sponsor + delivery lead |
| Escalation | As needed | Delivery lead → sponsor → ‹executive owner› |

Decisions of architectural significance are recorded as **ADRs** in the repository;
day-to-day work is tracked on `main` with green-CI gating. Primary contacts:
‹names / channels›.

## 11. Assumptions & dependencies

- An **Entra ID tenant** is available with rights to create app registrations and
  grant admin consent; **MFA/Conditional Access** will be enabled organisation-side.
- A **SharePoint** site holds the governed documents; `Sites.Selected` consent is granted.
- A **Windows/VMware host** with Docker Desktop + WSL2 (or the agreed Azure target)
  is provisioned; TLS certificates are supplied.
- The client provides directory data via Entra and nominates admins/approvers.
- Off-host, access-controlled **backup storage** is available.

## 12. Constraints & environment

- Single-instance deployment on the VM model (availability target RTO ≤ 4h; the value
  is durability of the evidence, not high availability — see `DISASTER-RECOVERY.md`).
- **On-prem / air-gapped friendly**: the offline documentation (HTML docs + flows
  gallery) and container build run without internet egress.
- No AI/ML processing (by design).
- Runs on Node 22 / PostgreSQL 16 / modern evergreen browsers. Full technical
  requirements: `REQUIREMENTS.md` §6 (TR-*); deployment steps: `INSTALL-GUIDE.md`.

## 13. Non-functional requirements & security obligations

- **Security & compliance** — three-layer server-authoritative RBAC; the supplier
  delivers and maintains a **STRIDE + MITRE ATT&CK threat model** (`THREAT-MODEL.md`),
  a CI-gated **controls-as-code** catalogue mapped to ISO 27001 / NIST CSF / GDPR /
  Zero Trust / MITRE ATT&CK, an ISO 27001:2022 **Statement of Applicability**, a
  **Zero-Trust** posture mapping, and a **GDPR** pack. CSP + security headers, single
  origin, parameterized SQL, upload allowlist.
- **Accessibility & UX** — friendly error catalogue (~32 codes); light/dark theming;
  15-minute idle logout.
- **Reliability** — healthchecks; leader-locked schedulers; backup + rehearsed DR.
- **Observability** — structured logs + correlation ids; Prometheus metrics;
  DB-checked readiness.
- **Data integrity** — append-only ledgers enforced by DB grants; tracked
  transactional migrations.

The highest residual items are organisation-side: enabling MFA/Conditional Access,
at-rest encryption, and SIEM forwarding (tracked in `NEXT-STEPS.md`).

## 14. Data protection & confidentiality

**Roles.** The **Client is the data controller**; the Supplier acts as **processor**
for any personal data it accesses during delivery/support and processes it only on the
Client's documented instructions. Records of processing, the DPIA and the privacy
notice are provided in the GDPR pack (`gdpr/`).

**Data-processing terms** (data categories, purposes, retention, sub-processors,
transfer mechanism, security measures, breach-notification, and assistance with
data-subject rights) are agreed in a **Data Processing Agreement** —
‹DPA reference / to be executed›.

**Confidentiality.** Each party protects the other's confidential information; the
Supplier commits no secrets to the repository (secrets live in `.env`/Key Vault,
gitleaks-scanned in CI). Data residency and permitted sub-processors: ‹to specify›.

## 15. Intellectual property & licensing

- **Bespoke deliverables** (the application source, documentation and diagrams
  produced under this SoW) are ‹assigned to / licensed to› the Client on **full
  payment**; the exact model is a commercial term to confirm.
- **Supplier background IP** (pre-existing tooling, generic know-how) remains the
  Supplier's, with a licence to the Client to use it as embedded in the deliverables.
- **Third-party / open-source.** The stack uses permissively-licensed OSS (Node.js,
  Express, React, PostgreSQL, nginx, and the dependencies in the lockfiles) under
  their respective licences (predominantly MIT / Apache-2.0 / BSD / the PostgreSQL
  licence). No copyleft (GPL/AGPL) obligation is introduced. Committed lockfiles serve
  as the SBOM.
- **Microsoft services** (Entra ID, Graph, SharePoint, Exchange) are consumed under
  the **Client's own licences/subscriptions**.

## 16. Warranty, support & maintenance

**Warranty.** For **‹N› months** after final acceptance the Supplier corrects, at no
charge, defects where a deliverable does not conform to this SoW. Excludes issues
caused by client-side configuration, third-party outages, or unauthorised modification.

| Severity | Response target | Resolution target |
|----------|-----------------|-------------------|
| Critical (down / security / data) | ‹e.g. 4 business hrs› | ‹e.g. 1 business day› |
| Major | ‹1 business day› | ‹5 business days› |
| Minor | ‹3 business days› | Next release |

**Maintenance (optional, separate agreement).** Ongoing dependency updates (grouped
Dependabot + `npm audit`/Trivy gates), security patching, and minor enhancements can
be provided under a support/maintenance agreement — ‹scope & rate to confirm›.

## 17. Delivery risk register

Security/technical risks to the running system are catalogued in `THREAT-MODEL.md` §7;
the delivery/operational risks are below (L = likelihood, I = impact).

| ID | Risk | L | I | Mitigation | Owner |
|----|------|---|---|------------|-------|
| DR-1 | MFA / Conditional Access not enabled | Med | High | Enable org-side before go-live | Client/IT |
| DR-2 | Data at rest unencrypted (host/DB) | Med | Med | BitLocker + `PGSSL`/managed encryption | Client/IT |
| DR-3 | Backups not off-host (ransomware / VM loss) | Low | High | Scheduled off-host backup + rehearsed DR | Client/IT · Delivery |
| DR-4 | Dependency vulnerabilities over time | Med | Med | CI audit/Trivy gate + grouped Dependabot | Delivery |
| DR-5 | Client environment readiness delays go-live | Med | Med | Early install-guide checklist; §11 dependencies tracked | Client/IT |
| DR-6 | SharePoint / Graph permission misconfiguration | Low | Med | Documented consent steps; verify in staging | Client/IT |
| DR-7 | Azure migration scope creep | Med | Med | Separate SoW; ADR-gated; explicitly out of scope here | Sponsor |

## 18. Change control

Any change to scope, deliverables, acceptance criteria, schedule or price is handled
by a written **Change Request**. Work continues on the unchanged baseline until the CR
is approved by both parties.

| CR field | Content |
|----------|---------|
| CR-ID / date | Sequential id + raised date |
| Requestor | Name / party |
| Description & rationale | What changes and why |
| Impact | Scope · schedule · effort · **price** · risk |
| Decision | Approved / rejected / deferred |
| Approvals | ‹Sponsor› + ‹Delivery lead›, with dates |

## 19. Commercials

[To be completed by the parties.] Structure to confirm:

- **Pricing model**: ‹fixed price / time & materials / capped T&M›.
- **Total / rates**: ‹amount or day-rate + estimated effort›.
- **Payment schedule**: tied to milestone acceptance (M1–M6) — ‹% or amount per milestone›.
- **Expenses**: ‹pass-through / included›; **invoicing**: ‹Net N days›.
- **Third-party costs** (Azure, Entra/M365 licences, TLS) are the Client's and are
  excluded from the above.

## 20. Contractual framework

This Statement of Work is executed under, and incorporates the terms of, the
**Master Services Agreement** between the parties — ‹MSA reference / date›. General
legal terms — **liability, indemnities, insurance, termination and dispute
resolution** — are governed by the MSA and are not restated here. Where this SoW and
the MSA conflict, the MSA prevails except where this SoW expressly states otherwise.
Governing law: ‹jurisdiction›.

## 21. Acceptance & sign-off

Acceptance is granted per milestone (§6, §8). Final acceptance follows M6 (live
sign-off).

| Party | Name | Signature | Date |
|---|---|---|---|
| Client / Sponsor | [ ] | | |
| Delivery lead | [ ] | | |
| DPO (compliance) | [ ] | | |
| Architecture / IT | [ ] | | |

Effective date: ‹on last signature› · SoW version: v1.2 (draft) · Supersedes: ‹v1.1 draft›

## 22. References

`REQUIREMENTS.md` · `USER-STORIES.md` · `HLD.md` · `LLD.md` ·
`ARCHITECTURE-AND-DECISIONS.md` · `THREAT-MODEL.md` · `ISO27001-SOA.md` ·
`ZERO-TRUST.md` · `SECURITY-FRAMEWORKS.md` · GDPR pack (`gdpr/`) · `INSTALL-GUIDE.md` ·
`DISASTER-RECOVERY.md` · [`FUNCTIONAL-FLOWS.md`](../FUNCTIONAL-FLOWS.md) (+ offline
[`flows-gallery.html`](../flows-gallery.html)) · `PROJECT-MAP.md`.
