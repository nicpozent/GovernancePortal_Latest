# Project Map — Birgma Governance Portal

_Where everything lives: a "where do I find X" quick-reference, then a
folder-by-folder description of the repository. For a **guided review order**
(what to read first and why), see [`docs/INDEX.md`](docs/INDEX.md)._

---

## 1. Where to find… (quick reference)

| I'm looking for… | Open this |
|------------------|-----------|
| **Description of the solution** (what it is, overview) | [`README.md`](README.md) → then [`docs/HLD.md`](docs/HLD.md) §1–3 and [`docs/ARCHITECTURE-AND-DECISIONS.md`](docs/ARCHITECTURE-AND-DECISIONS.md) Part I |
| **Statement of Work (SoW)** | [`docs/sow/STATEMENT-OF-WORK.md`](docs/sow/STATEMENT-OF-WORK.md) (+ offline [`.html`](docs/sow/STATEMENT-OF-WORK.html)) |
| **Functional flows** (system & data · user journeys · dev interaction — 31 diagrams) | [`docs/FUNCTIONAL-FLOWS.md`](docs/FUNCTIONAL-FLOWS.md) (+ offline [`.html`](docs/FUNCTIONAL-FLOWS.html) and inline-SVG gallery [`flows-gallery.html`](docs/flows-gallery.html)) |
| **Requirements** (functional / non-functional / technical / candidate) | [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) |
| **High-Level Design (HLD)** | [`docs/HLD.md`](docs/HLD.md) (application-wide) · [`docs/approval-workflow/HLD.md`](docs/approval-workflow/HLD.md) (approval feature) |
| **Low-Level Design (LLD)** | [`docs/LLD.md`](docs/LLD.md) (application-wide) · [`docs/approval-workflow/LLD.md`](docs/approval-workflow/LLD.md) (approval feature) |
| **User stories** | [`docs/USER-STORIES.md`](docs/USER-STORIES.md) (application-wide) · [`docs/approval-workflow/USER-STORIES.md`](docs/approval-workflow/USER-STORIES.md) (approval feature) |
| **Architecture Decision Records (ADRs)** | [`docs/ARCHITECTURE-AND-DECISIONS.md`](docs/ARCHITECTURE-AND-DECISIONS.md) Part II (ADR-101 … ADR-120) |
| **Capabilities — ABBs / SBBs** (TOGAF) | [`docs/ARCHITECTURE-BUILDING-BLOCKS.md`](docs/ARCHITECTURE-BUILDING-BLOCKS.md) + [`architecture-repository/`](architecture-repository/CATALOG.md) |
| **Diagrams** | System: [`docs/architecture-diagram.mmd`](docs/architecture-diagram.mmd) · Data model (ERD): [`docs/data-model.mmd`](docs/data-model.mmd) · Deployment: [`docs/deployment-diagram.mmd`](docs/deployment-diagram.mmd) · Request flow: [`docs/request-sequence.mmd`](docs/request-sequence.mmd) (each has a `.html` renderer) |
| **Threat model** (STRIDE + MITRE ATT&CK) | [`docs/THREAT-MODEL.md`](docs/THREAT-MODEL.md) + DFD [`docs/threat-model-dfd.mmd`](docs/threat-model-dfd.mmd) |
| **Security & compliance** | [`docs/SECURITY-REVIEW.md`](docs/SECURITY-REVIEW.md), [`docs/SECURITY-FRAMEWORKS.md`](docs/SECURITY-FRAMEWORKS.md), [`docs/ZERO-TRUST.md`](docs/ZERO-TRUST.md), [`docs/ISO27001-SOA.md`](docs/ISO27001-SOA.md), [`compliance/`](compliance/) |
| **Privacy / GDPR** | [`docs/GDPR-DATA-RIGHTS.md`](docs/GDPR-DATA-RIGHTS.md), [`docs/gdpr/`](docs/gdpr) (ROPA, DPIA, privacy notice) |
| **Install / build / run** | [`docs/INSTALL-GUIDE.md`](docs/INSTALL-GUIDE.md), [`deploy/docker-compose.yml`](deploy/docker-compose.yml), [`apps/api/BUILD.md`](apps/api/BUILD.md) |
| **Operate (reset / backup / DR / migrations / telemetry / TLS)** | [`docs/RESET.md`](docs/RESET.md), [`docs/RESTORE.md`](docs/RESTORE.md), [`docs/DISASTER-RECOVERY.md`](docs/DISASTER-RECOVERY.md), [`docs/DATABASE-MIGRATIONS.md`](docs/DATABASE-MIGRATIONS.md), [`docs/OBSERVABILITY.md`](docs/OBSERVABILITY.md), [`docs/TLS-AND-PERMISSIONS.md`](docs/TLS-AND-PERMISSIONS.md) |
| **End-user help** | [`docs/USER-GUIDE.md`](docs/USER-GUIDE.md), [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md) |
| **Testing & CI** | [`docs/TESTING.md`](docs/TESTING.md), [`.github/workflows/`](.github/workflows) |
| **Maturity assessment / backlog** | [`docs/APPLICATION-EVALUATION.md`](docs/APPLICATION-EVALUATION.md), [`docs/NEXT-STEPS.md`](docs/NEXT-STEPS.md) |
| **Guided review order (for reviewers)** | [`docs/INDEX.md`](docs/INDEX.md) |

---

## 2. Folder-by-folder

```
GovernancePortal_Latest/
├── README.md                 Project overview + quick start
├── REVIEW.md                 Running log of external review findings & resolutions
├── PROJECT-MAP.md            This file — where everything lives
├── .gitattributes            Line-ending normalization (LF for container scripts)
│
├── apps/                     The application code
│   ├── api/                  Node.js 22 / Express 5 backend
│   └── web/                  React 19 SPA + nginx edge
│
├── architecture-repository/  TOGAF ABB/SBB catalogue (capabilities)
├── compliance/               Controls-as-code (catalogue + report + coverage)
├── deploy/                   Docker Compose stack + operational scripts
├── docs/                     All architecture, design, requirements, security & ops docs
└── .github/workflows/        CI pipelines (ci · security · smoke)
```

### `apps/api/` — backend (Node.js 22 / Express 5)
| Path | What's in it |
|------|--------------|
| `src/` | Route modules (`routes/*.js`), token validation (`auth.js`), authorization/PDP (`authz.js`), services (`services/` — Graph, SharePoint, sync, reminders), `storage.js`, `ratelimit.js`, `leader.js`, `metrics.js`, `logger.js`, `gdpr.js`, `app.js`/`server.js` |
| `db/` | `schema.sql`, ordered `migration_0NN_*.sql`, `docker-grants.sql` (append-only enforcement), `migrate.js`, `gdpr.js` CLI |
| `test/` | `unit/`, `integration/` (against a real Postgres), `helpers/` |
| `scim/` | Entra SCIM provisioning endpoint (optional) |
| `Dockerfile`, `BUILD.md`, `IMPLEMENTATION_GUIDE.md` | Container build + build/impl notes |

### `apps/web/` — frontend (React 19 SPA)
| Path | What's in it |
|------|--------------|
| `src/` | `app.jsx` (shell + view router), `components/*.jsx` (domain UI), `api.js` (typed API client + MSAL), `theme.js` + `_tokens.css`, `errors.js` |
| `nginx.conf` | Edge: TLS, security headers/CSP, `/api` reverse proxy, SPA fallback |
| `test/` | Vitest unit tests | 
| `index.html`, `vite.config.js`, `40-envconfig.sh`, `Dockerfile` | Entry, build config, runtime-config injection, container build |

### `architecture-repository/` — TOGAF capabilities
One folder per Architecture Building Block under `business/`, `data/`, `application/`, `technology/`; each holds a product-neutral `ABB.md` and a realizing `sbb/SBB.md`. `CATALOG.md` is the index; `tools/generate.mjs` regenerates the tree from a single manifest.

### `compliance/` — controls-as-code
`controls.json` (control catalogue with framework/ATT&CK/evidence mappings), `report.mjs` (deterministic coverage/gap report + validator, CI-gated), `COVERAGE.md` (generated snapshot).

### `deploy/` — deployment
`docker-compose.yml` (the web/api/db stack), `docker-compose.logging.yml` + `logging/` (optional log shipping), `scripts/` (backup / reset / DR PowerShell). Your local `.env`, `certs/`, `backups/`, `uploads/` live here (all gitignored).

### `docs/` — documentation
Top level holds the architecture, design, requirements, security, compliance and operations documents (see §1 for the map) plus the four Mermaid diagrams (`*.mmd`) and their `.html` renderers. Sub-packages:
- `docs/approval-workflow/` — self-contained deep-dive for the policy approval feature (its own HLD, LLD, user stories, security assessment, ABB/SBB, and `diagrams/`).
- `docs/gdpr/` — controller artefacts (ROPA, DPIA, privacy notice).

### `.github/workflows/` — CI
`ci.yml` (lint, unit + integration on real Postgres, coverage gate, web build), `security.yml` (secret/dependency/SAST scans + controls-compliance gate), `smoke.yml` (docker-compose end-to-end).

---

_Maintained on `main`. If you only read one other file, make it
[`docs/INDEX.md`](docs/INDEX.md) — it sequences these documents into a suggested
review order._
