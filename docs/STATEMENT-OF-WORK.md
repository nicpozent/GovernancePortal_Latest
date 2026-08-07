# Statement of Work — Birgma Governance Portal

> **How to use this document.** The scope, deliverables, acceptance criteria and
> security/compliance commitments below are grounded in the delivered system.
> Fields in **[brackets]** — parties, dates, effort and commercials — are for the
> contracting parties to complete; they are intentionally not pre-filled.

| | |
|---|---|
| **Project** | Birgma Governance Portal — policy governance, attestation & compliance evidence |
| **Client / Sponsor** | [Birgma / Biltema — sponsor name] |
| **Supplier / Delivery** | [Delivery team / vendor] |
| **SoW version** | 1.0 · [date] |
| **Effective period** | [start] – [end] |
| **Document owner** | [name, role] |

---

## 1. Purpose

This Statement of Work defines the scope, deliverables, approach, acceptance
criteria and responsibilities for the design, build and hand-over of the **Birgma
Governance Portal** — a web application that distributes governance documents,
collects binding acknowledgements (optionally gated on a knowledge check), routes
documents through a pre-publication approval chain, targets obligations at people
via groups, and produces tamper-evident compliance evidence, with identity federated
to **Microsoft Entra ID**.

## 2. Background

The organisation needs a defensible, auditable way to prove that the right people
have read and understood the right policies, and to satisfy ISO 27001 / GDPR
obligations without manual spreadsheet tracking. The portal replaces ad-hoc
distribution with a controlled lifecycle and an append-only evidence ledger.

## 3. Objectives

1. Federated single sign-on and least-privilege authorisation (Entra ID).
2. A controlled **policy lifecycle** with versioning and pre-publication approval.
3. **Binding acknowledgement** bound to identity + version + time, optionally gated
   on a **knowledge check**.
4. **Targeting** obligations at the right population via groups and directory sync.
5. **Assurance**: dashboards, reporting/export, and a tamper-evident audit trail.
6. **Compliance by design**: GDPR data-subject rights and a controls-as-code posture.
7. **Portability**: container-first, ready for an Azure-native target.

## 4. Scope of work

### 4.1 In scope (work packages)
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

### 4.2 Out of scope
- Hosting, network, and identity-tenant administration beyond configuration guidance
  (Entra tenant, VMware/Windows host, corporate network, firewalls).
- Organisation-side security controls (MFA/Conditional Access enablement, at-rest
  disk encryption, SIEM ingestion) — the application supports them; enabling them is
  an operator/IT action.
- Data migration from legacy systems (unless added by change request).
- The Azure-native production migration (designed for; delivered under a separate SoW).
- Any AI/ML capability (explicitly not applicable — see `SECURITY-FRAMEWORKS.md`).

## 5. Deliverables

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
| D9 | User & functional documentation | Markdown + HTML | `USER-GUIDE.md`, `FUNCTIONAL-FLOWS.md` |

## 6. Approach & delivery phases

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

## 7. Milestones & acceptance criteria

| Milestone | Acceptance criteria |
|-----------|---------------------|
| M1 Functional acceptance | All in-scope features demonstrable against `REQUIREMENTS.md` (FR-*) and `USER-STORIES.md`; integration tests green |
| M2 Security acceptance | Threat model reviewed; controls-as-code `report.mjs --check` green; no High findings in `npm audit`/Trivy; secrets scan clean |
| M3 Operational acceptance | `docker compose` deployment per `INSTALL-GUIDE.md`; healthchecks pass; **DR restore rehearsed** per `DISASTER-RECOVERY.md` |
| M4 Compliance acceptance | ISO 27001 SoA populated; GDPR pack reviewed by [DPO]; audit trail verified |
| M5 Documentation & hand-over | D4–D9 delivered; knowledge-transfer session held |
| M6 Live sign-off | A real Entra interactive sign-in verified in [staging/production]; go-live approved by [sponsor] |

**Definition of Done (per work package):** code merged to `main` behind green CI;
tests for the behaviour; documentation updated; no High/Critical security findings.

## 8. Roles & responsibilities (RACI)

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

## 9. Assumptions & dependencies

- An **Entra ID tenant** is available with rights to create app registrations and
  grant admin consent; **MFA/Conditional Access** will be enabled organisation-side.
- A **SharePoint** site holds the governed documents; `Sites.Selected` consent is granted.
- A **Windows/VMware host** with Docker Desktop + WSL2 (or the agreed Azure target)
  is provisioned; TLS certificates are supplied.
- The client provides directory data via Entra and nominates admins/approvers.
- Off-host, access-controlled **backup storage** is available.

## 10. Constraints

- Single-instance deployment on the VM model (availability target RTO ≤ 4h; the value
  is durability of the evidence, not high availability — see `DISASTER-RECOVERY.md`).
- No AI/ML processing (by design).
- Runs on Node 22 / PostgreSQL 16 / modern evergreen browsers.

## 11. Environment & technical requirements

Technical requirements are specified in `REQUIREMENTS.md` §6 (TR-*): platform,
frontend, identity, API/data, storage, messaging, security, observability, CI and
compatibility. Deployment steps are in `INSTALL-GUIDE.md`.

## 12. Security & compliance obligations

The supplier will deliver and maintain: a **STRIDE + MITRE ATT&CK threat model**
(`THREAT-MODEL.md`), a **controls-as-code** catalogue mapped to ISO 27001 / NIST CSF
/ GDPR / Zero Trust / MITRE ATT&CK (`compliance/controls.json`, CI-gated), an ISO
27001:2022 **Statement of Applicability** (`ISO27001-SOA.md`), a **Zero-Trust** posture
mapping (`ZERO-TRUST.md`), and a **GDPR** pack (ROPA/DPIA/privacy notice). Residual
risks and the hardening backlog are tracked in the threat model and `NEXT-STEPS.md`.

## 13. Change control & governance

Changes to scope, deliverables or acceptance criteria are handled by written **change
request**: description, rationale, impact on schedule/effort, and sign-off by [sponsor]
and [delivery lead]. Day-to-day delivery is tracked on `main` with green-CI gating and
ADRs for significant decisions.

## 14. Risks

Key delivery/operational risks and their mitigations are catalogued in
`THREAT-MODEL.md` §7 and `NEXT-STEPS.md`. The highest residual items are
organisation-side: enabling MFA/Conditional Access, at-rest encryption, and SIEM
forwarding.

## 15. Commercials

[To be completed by the parties — effort estimate, rate/fixed price, payment schedule,
expenses, and any support/maintenance terms. Not pre-filled.]

## 16. Acceptance & sign-off

Acceptance is granted per milestone (§7). Final acceptance follows M6 (live sign-off).

| Party | Name | Signature | Date |
|---|---|---|---|
| Client / Sponsor | [ ] | | |
| Delivery lead | [ ] | | |
| DPO (compliance) | [ ] | | |

## 17. References

`REQUIREMENTS.md` · `USER-STORIES.md` · `HLD.md` · `LLD.md` ·
`ARCHITECTURE-AND-DECISIONS.md` · `THREAT-MODEL.md` · `ISO27001-SOA.md` ·
`ZERO-TRUST.md` · `SECURITY-FRAMEWORKS.md` · GDPR pack (`gdpr/`) · `INSTALL-GUIDE.md` ·
`DISASTER-RECOVERY.md` · `FUNCTIONAL-FLOWS.md` · `PROJECT-MAP.md`.
