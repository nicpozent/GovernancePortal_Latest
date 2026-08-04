# Documentation Index & Review Guide — Birgma Governance Portal

_Entry point for the **Enterprise Application team review**. It gives (1) a
suggested reading order, (2) a folder-by-folder map of the repository, and (3) a
catalogue of every document with its purpose. Everything is version-controlled on
`main`; claims are traceable to code, tests, ADRs, and a CI-gated controls
catalogue._

**What this is:** a policy/governance compliance platform — a React SPA + Node/
Express API + PostgreSQL 16, secured by Microsoft Entra ID, packaged with Docker
Compose (Azure-native as the target). It distributes governance documents,
collects binding acknowledgements (optionally quiz-gated), routes policies through
a pre-publication approval workflow, and produces tamper-evident compliance
evidence.

---

## 1. Suggested review order (for an EA reviewer)

Read top-to-bottom; each step links the authoritative document.

| # | To understand… | Read | Why |
|---|----------------|------|-----|
| 1 | **What it is + how mature** | [`APPLICATION-EVALUATION.md`](APPLICATION-EVALUATION.md) | 18-dimension evidence-based scorecard + verdict; fastest orientation |
| 2 | **The architecture & the decisions** | [`ARCHITECTURE-AND-DECISIONS.md`](ARCHITECTURE-AND-DECISIONS.md) + [`architecture-diagram.mmd`](architecture-diagram.mmd) | 20 ADRs (each lists rejected alternatives); the system diagram |
| 2a | **The design (app-wide)** | [`HLD.md`](HLD.md) → [`LLD.md`](LLD.md) + [`deployment-diagram.mmd`](deployment-diagram.mmd) + [`request-sequence.mmd`](request-sequence.mmd) | High- & low-level design: components, deployment topology, end-to-end flow, per-module endpoint reference |
| 3 | **Capabilities, product-neutral (TOGAF)** | [`ARCHITECTURE-BUILDING-BLOCKS.md`](ARCHITECTURE-BUILDING-BLOCKS.md) + [`../architecture-repository/CATALOG.md`](../architecture-repository/CATALOG.md) | ABBs → SBBs; reusable-capability view for the Enterprise Continuum |
| 4 | **What it must do / the qualities** | [`REQUIREMENTS.md`](REQUIREMENTS.md) | Functional + non-functional + technical + candidate requirements, with traceability |
| 5 | **Security posture** | [`THREAT-MODEL.md`](THREAT-MODEL.md) → [`SECURITY-REVIEW.md`](SECURITY-REVIEW.md) → [`SECURITY-FRAMEWORKS.md`](SECURITY-FRAMEWORKS.md) → [`ZERO-TRUST.md`](ZERO-TRUST.md) → [`ISO27001-SOA.md`](ISO27001-SOA.md) | STRIDE + MITRE ATT&CK threat model; security review; controls-as-code; Zero Trust pillars; ISO 27001:2022 SoA |
| 6 | **Privacy / GDPR** | [`GDPR-DATA-RIGHTS.md`](GDPR-DATA-RIGHTS.md) + [`gdpr/`](gdpr/) | Data-subject rights tooling; ROPA / DPIA / privacy-notice drafts |
| 7 | **A feature end-to-end (depth sample)** | [`approval-workflow/README.md`](approval-workflow/README.md) | HLD, LLD, user stories, security assessment, ABB/SBB, diagrams for one feature |
| 8 | **Build, run & operate** | [`INSTALL-GUIDE.md`](INSTALL-GUIDE.md), [`DISASTER-RECOVERY.md`](DISASTER-RECOVERY.md), [`OBSERVABILITY.md`](OBSERVABILITY.md), [`DATABASE-MIGRATIONS.md`](DATABASE-MIGRATIONS.md) | Deployment, DR (rehearsed), telemetry, schema management |
| 9 | **How to verify the claims** | [`TESTING.md`](TESTING.md) + [`../.github/workflows/`](../.github/workflows) + [`../compliance/`](../compliance) | Tests, CI gates, and the deterministic controls report |

**Fastest path if you only read three:** #1 (evaluation) → #2 (architecture/ADRs)
→ #5 (security/compliance).

---

## 2. Repository map (folder by folder)

| Path | What's in it |
|------|--------------|
| [`docs/`](.) | **All architecture, security, compliance, and operations documentation** (catalogued in §3). This index lives here. |
| [`docs/approval-workflow/`](approval-workflow) | Self-contained documentation **package for the policy approval workflow** (ADR-120): HLD, LLD, user stories, security assessment, ABB/SBB, and source diagrams. |
| [`docs/gdpr/`](gdpr) | GDPR controller artefacts: **ROPA, DPIA, privacy notice** (drafted from real behaviour; pending DPO sign-off). |
| [`architecture-repository/`](../architecture-repository) | **TOGAF Architecture Repository** — one folder per Architecture Building Block (business/data/application/technology) with its neutral `ABB.md` and the realizing `sbb/SBB.md`. `CATALOG.md` is the index. |
| [`compliance/`](../compliance) | **Controls-as-code:** `controls.json` (the control catalogue with framework/ATT&CK/risk mappings + evidence), `report.mjs` (deterministic coverage/gap report + validator, CI-gated), `COVERAGE.md` (generated). |
| [`apps/api/`](../apps/api) | **Node/Express API** — `src/` (routes, auth/authz, services, storage, metrics), `db/` (schema + ordered migrations + grants), `test/` (unit + integration on real Postgres), `scim/` (Entra provisioning option), `Dockerfile`. |
| [`apps/web/`](../apps/web) | **React SPA** — `src/` (decomposed component modules, API client, theme tokens), `nginx.conf` (edge TLS/CSP/proxy), `index.html`, `test/` (vitest), `Dockerfile`. |
| [`deploy/`](../deploy) | **Deployment** — `docker-compose.yml` (the stack), `scripts/` (backup / DR PowerShell), `logging/` + `docker-compose.logging.yml` (optional log shipping). |
| [`.github/workflows/`](../.github/workflows) | **CI** — `ci.yml` (lint, tests, Postgres integration, coverage gate, web build), `security.yml` (gitleaks, Trivy, semgrep, controls-compliance gate), `smoke.yml` (docker-compose e2e). |
| [`README.md`](../README.md) / [`REVIEW.md`](../REVIEW.md) | Project overview; running log of external review findings and their resolution. |

---

## 3. Document catalogue (by concern)

### Architecture & design
- [`ARCHITECTURE-AND-DECISIONS.md`](ARCHITECTURE-AND-DECISIONS.md) — 20 Architecture Decision Records (ADR-101…120); each states the decision, alternatives rejected, and trade-offs. **The authoritative design rationale.**
- [`HLD.md`](HLD.md) — **application-wide High-Level Design**: components, deployment view, key end-to-end flow, cross-cutting design, NFR summary. The discoverable design view (the ADR doc holds the rationale).
- [`LLD.md`](LLD.md) — **application-wide Low-Level Design**: per-module endpoint reference, key algorithms, data model, security specifics (the approval feature has its own LLD).
- [`ARCHITECTURE-BUILDING-BLOCKS.md`](ARCHITECTURE-BUILDING-BLOCKS.md) — TOGAF ABB→SBB catalogue (capabilities vs. their realization); reuse/maturity notes.
- [`architecture-diagram.mmd`](architecture-diagram.mmd) / [`architecture-diagram.html`](architecture-diagram.html) — the system (container/service) diagram (Mermaid source + a renderer).
- [`data-model.mmd`](data-model.mmd) / [`data-model.html`](data-model.html) — the whole-application **entity-relationship diagram**: every table drawn as a table (columns + PK/FK/UK) with its relationships, generated from the real schema + migrations.
- [`deployment-diagram.mmd`](deployment-diagram.mmd) / [`deployment-diagram.html`](deployment-diagram.html) — the **deployment/infrastructure view**: hosts, containers, ports, volumes, trust zones, and the Azure-native target.
- [`request-sequence.mmd`](request-sequence.mmd) / [`request-sequence.html`](request-sequence.html) — the **whole-application sequence**: sign-in → read → quiz → acknowledge, across every layer.
- [`USER-STORIES.md`](USER-STORIES.md) — application-wide **user stories** (Gherkin + acceptance criteria + story→endpoint→test matrix) for every persona; the approval workflow has its own set.
- [`REQUIREMENTS.md`](REQUIREMENTS.md) — functional (by domain), non-functional (by quality attribute), technical (technology constraints, by area), and candidate/future requirements, with actors, MoSCoW priority, status, and traceability.

### Security & compliance
- [`THREAT-MODEL.md`](THREAT-MODEL.md) — the **STRIDE + MITRE ATT&CK** threat model: DFD + trust boundaries ([`threat-model-dfd.mmd`](threat-model-dfd.mmd)), a STRIDE→ATT&CK threat register mapped to controls, an ATT&CK coverage matrix, a LINDDUN privacy pass, and prioritized residual risks.
- [`SECURITY-REVIEW.md`](SECURITY-REVIEW.md) — the platform security review (threats, controls, hardening, residual risks).
- [`SECURITY-FRAMEWORKS.md`](SECURITY-FRAMEWORKS.md) — the controls-as-code approach (ISO 27001 · NIST CSF · GDPR · Zero Trust · MITRE ATT&CK); links the artefacts below.
- [`ZERO-TRUST.md`](ZERO-TRUST.md) — Zero Trust posture across the NIST 800-207 / CISA ZTMM pillars, per-pillar maturity + roadmap.
- [`ISO27001-SOA.md`](ISO27001-SOA.md) — ISO/IEC 27001:2022 Statement of Applicability, all 93 Annex A controls (applicability, status, justification).
- [`CODE-REVIEW-2026-06.md`](CODE-REVIEW-2026-06.md) — a point-in-time code-review record.

### Privacy / GDPR
- [`GDPR-DATA-RIGHTS.md`](GDPR-DATA-RIGHTS.md) — data-subject rights tooling (DSAR export, lawful erasure, retention purge).
- [`gdpr/ROPA.md`](gdpr/ROPA.md), [`gdpr/DPIA.md`](gdpr/DPIA.md), [`gdpr/PRIVACY-NOTICE.md`](gdpr/PRIVACY-NOTICE.md) — controller artefacts (draft, pending DPO sign-off).

### Feature deep-dive — policy approval workflow (ADR-120)
- [`approval-workflow/README.md`](approval-workflow/README.md) — package index + decision log.
- [`approval-workflow/HLD.md`](approval-workflow/HLD.md) / [`LLD.md`](approval-workflow/LLD.md) — high- and low-level design.
- [`approval-workflow/USER-STORIES.md`](approval-workflow/USER-STORIES.md) — personas + Gherkin stories + story→endpoint→test traceability.
- [`approval-workflow/SECURITY-ASSESSMENT.md`](approval-workflow/SECURITY-ASSESSMENT.md) — STRIDE, RBAC matrix, abuse cases.
- [`approval-workflow/BUILDING-BLOCKS.md`](approval-workflow/BUILDING-BLOCKS.md) + [`diagrams/`](approval-workflow/diagrams) — feature ABBs/SBBs + Mermaid diagrams.
- [`POLICY-APPROVAL-WORKFLOW.md`](POLICY-APPROVAL-WORKFLOW.md) — the original design/ADR companion + shipped-status log.

### Operations & runbooks
- [`INSTALL-GUIDE.md`](INSTALL-GUIDE.md) — build & deploy the stack.
- [`DISASTER-RECOVERY.md`](DISASTER-RECOVERY.md) — rehearsed DR (backup/restore, off-host).
- [`DATABASE-MIGRATIONS.md`](DATABASE-MIGRATIONS.md) — schema migration model.
- [`OBSERVABILITY.md`](OBSERVABILITY.md) — logs, metrics, health/readiness.
- [`TLS-AND-PERMISSIONS.md`](TLS-AND-PERMISSIONS.md) — TLS + Entra/Graph permission model.
- [`TESTING.md`](TESTING.md) — test strategy (unit, integration on real Postgres, smoke e2e, coverage gate).
- [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md) — operator troubleshooting + the API error-code catalogue.
- [`RESET.md`](RESET.md) / [`RESTORE.md`](RESTORE.md) — reset and restore procedures.

### Status & assessment
- [`APPLICATION-EVALUATION.md`](APPLICATION-EVALUATION.md) — the maturity scorecard (source of record; mirrored in-app under Admin → Application Evaluation).
- [`NEXT-STEPS.md`](NEXT-STEPS.md) — the forward backlog.

---

## 4. How to verify (not just read)

Reviewers can confirm claims independently:

- **Decisions ↔ capabilities ↔ requirements ↔ tests** are cross-referenced (see `REQUIREMENTS.md §9` and `approval-workflow/USER-STORIES.md §5`).
- **Controls coverage is computed, not asserted:** run `node compliance/report.mjs` for the coverage/gap report; CI fails if `COVERAGE.md` is stale or the catalogue is invalid.
- **CI gates** (`.github/workflows/`) enforce lint, unit + integration tests (against a real Postgres), a coverage threshold, dependency/secret/SAST scans, the controls-compliance check, and a docker-compose smoke test on every change.

## 5. Known open items (for reviewer context — already documented)

These are tracked, not hidden — see `REQUIREMENTS.md §7` (candidates) and the SoA:
- **Operator/organizational actions:** enable MFA / Conditional Access; at-rest encryption + `PGSSL`; adopt the GDPR artefacts (DPO sign-off); wire logs to a SIEM.
- **Deferred by choice:** Azure migration (IaC + CD + managed PostgreSQL PITR + private endpoints + Key Vault).
- **Planned:** incident-response + breach runbooks (IR-01 / GDPR-04).

_This index is maintained on `main`. Suggested review artefact to circulate: this
file plus the published dashboards (Application Evaluation and the Architecture &
Assurance Dossier) if a browsable summary is preferred._
