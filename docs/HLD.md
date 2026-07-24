# High-Level Design (HLD) — Birgma Governance Portal

_Application-wide high-level design: the components, their responsibilities and
interactions, the deployment topology, the key end-to-end flows, and the
cross-cutting qualities. This is the **design view**; the **decision rationale**
(with rejected alternatives) lives in
[`ARCHITECTURE-AND-DECISIONS.md`](ARCHITECTURE-AND-DECISIONS.md) (ADR-101…120), the
**capability view** in [`ARCHITECTURE-BUILDING-BLOCKS.md`](ARCHITECTURE-BUILDING-BLOCKS.md)
and [`../architecture-repository/`](../architecture-repository), and the
**implementation-level detail** in [`LLD.md`](LLD.md). A feature-scoped HLD for the
policy approval workflow is in [`approval-workflow/HLD.md`](approval-workflow/HLD.md)._

---

## 1. Purpose & scope

The portal distributes governance documents, collects binding acknowledgements
(optionally gated on a knowledge check), routes documents through a pre-publication
approval chain, targets obligations at people via groups, and produces tamper-evident
compliance evidence. Identity is federated to **Microsoft Entra ID**.

This HLD covers the whole application. It is deliberately technology-aware but stops
above code-level detail (schemas, endpoint contracts, algorithms) — those are in the
LLD. Requirements traced here use the IDs in [`REQUIREMENTS.md`](REQUIREMENTS.md).

## 2. Architectural drivers

| Driver | Source | Consequence |
|--------|--------|-------------|
| Tamper-evident compliance evidence | FR-ACK, FR-AUD, NFR-INT | Append-only ledgers enforced at the **database grant** layer (ADR-109) |
| Zero-trust, per-request authorization | NFR-SEC-02, Zero Trust | Every request re-validated and re-authorized server-side; default deny |
| Federated enterprise identity | FR-IAM, ADR-101 | Entra ID OIDC/OAuth2; delegated tokens only; app roles |
| Least-privilege integration | FR-DIR, FR-POL-03, ADR-112 | `Sites.Selected`, assigned-principals-only sync, Managed Identity target |
| Portability to Azure | NFR-CMP-01, ADR-117 | Container-first; storage/secret/scheduler abstractions to swap in Azure services |
| Operable by a small team | NFR-MNT, NFR-AVL | Docker Compose; one datastore; in-process leader-locked schedulers |

## 3. Logical architecture (containers)

Three containers behind Entra ID — see [`architecture-diagram.mmd`](architecture-diagram.mmd)
(`.html` renderer) for the diagram.

| Container | Technology | Responsibility |
|-----------|-----------|----------------|
| **web** | nginx (alpine) | TLS termination, security headers + CSP, serve the SPA, reverse-proxy `/api` same-origin |
| **api** | Node 22 / Express 5 | Token validation, RBAC (PDP), all domain logic, integrations, schedulers, observability |
| **db** | PostgreSQL 16 | Relational store; append-only ledgers enforced by revoked grants; advisory locks |

External, enterprise-shared: **Entra ID** (sign-in, JWKS, app roles) and **Microsoft
Graph** (directory, SharePoint documents, mail). The only browser-facing surface is
nginx; the API and database are never published to the network directly.

## 4. Component decomposition

**API (`apps/api/src/`)** — thin `server.js` (listen + leader-locked schedulers) over
`app.js` (middleware chain, `/healthz`·`/readyz`·`/metrics`, `/feed/audit`, error
handler) mounting per-domain route modules under `routes/`:

| Module | Endpoints (see LLD §for detail) | Concern |
|--------|-------------------------------|---------|
| `me` | `/me` | identity/role projection |
| `policies` | `/policies*`, `/policies/:id/document`·`/content`, `/versions` | policy lifecycle + document access |
| `signatures` | `/signatures` | acknowledgement ledger |
| `quizzes` | `/policies/:id/quiz*` | knowledge checks (server-graded) |
| `trainings` | `/trainings*`, `/policies/:id/file` | manager uploads |
| `employees` | `/employees*` | directory master |
| `groups` | `/groups*`, `/group-mappings*`, `/platform-groups`, `/directory-groups` | targeting |
| `manager` | `/manager/*` | delegated (team-scoped) views |
| `dashboards` | `/dashboard*`, `/reports/compliance` | assurance reporting |
| `approvals` | `/policies/:id/{approvers,submit,approve,reject,request-changes,withdraw,publish,approve-externally,approvals}`, `/approvals/pending` | pre-publication sign-off |
| `approval-templates` | `/approval-workflows*`, `/policies/:id/apply-workflow` | reusable approval chains |
| `admin` | `/sync*`, `/admin/backup(s)`, `/integrations*`, `/audit`, `/admin/data-subject/:oid/export`, `/sharepoint/browse` | operations, integrations, GDPR |

Cross-cutting API modules: `auth.js` (token validation), `authz.js` (PDP:
`isAdmin`/`isManager`/`canRead`/`canManage`/`teamOids`/`audit`), `graph.js` +
`services/` (Graph, SharePoint, sync, reminders), `storage.js` (file driver),
`ratelimit.js`, `leader.js` (advisory-lock leader election), `metrics.js`, `logger.js`,
`gdpr.js`.

**SPA (`apps/web/src/`)** — `main.jsx` bootstraps MSAL + theme, then `app.jsx` (the
shell + view router) over decomposed component modules (`components/*.jsx`), the typed
API client + MSAL wrapper (`api.js`), theme tokens (`theme.js`, `_tokens.css`), and the
error-message catalogue (`errors.js`).

## 5. Deployment view

See [`deployment-diagram.mmd`](deployment-diagram.mmd) (`.html` renderer). Docker
Compose on a Windows VM (VMware) with Docker Desktop + WSL2:

- **web** publishes `:443` (TLS 1.2/1.3) and `:80` (301→https); reverse-proxies `/api`
  to `api:8080` over the internal Docker network.
- **api** listens on `:8080`, reachable only via the proxy (same-origin CORS).
- **db** publishes `:5432` bound to `127.0.0.1` only — not on the VM network.
- State: `pgdata` named volume; `./uploads`, `./backups`, `./certs` (ro) bind mounts.
- Healthchecks + resource limits (mem/cpu/pids) per service; `restart: unless-stopped`.
- On a **fresh** database the schema + every migration run automatically as init scripts.

**Target (ADR-117):** lift-and-shift to Azure Container Apps + Azure Database for
PostgreSQL (PITR) + Blob + Key Vault + private endpoints — the storage, secret and
scheduler abstractions exist so this is a swap, not a rewrite.

## 6. Key end-to-end flow

The representative lifecycle — sign in, read an assigned policy, pass its quiz, and
acknowledge it — is drawn in [`request-sequence.mmd`](request-sequence.mmd) and narrated
step-by-step in [`ARCHITECTURE-AND-DECISIONS.md`](ARCHITECTURE-AND-DECISIONS.md) §3. It
exercises token validation, the three-layer authz, the SharePoint broker, server-side
quiz grading, and two append-only ledgers in one path.

## 7. Data architecture

One PostgreSQL database; 24 tables + 4 derived views. The whole-application ERD (every
table drawn as a table, with keys and relationships) is
[`data-model.mmd`](data-model.mmd) (`.html` renderer). Domain layering (reference,
obligation, ledger, operational) is described in `ARCHITECTURE-AND-DECISIONS.md` §6, and
per-table columns/DDL are in [`LLD.md`](LLD.md).

## 8. Cross-cutting design

- **Authentication (ADR-101/102):** Entra OIDC/OAuth2; the API validates every token —
  RS256 (pinned), issuer/audience/tenant/scope; app-only tokens rejected; JWKS cached.
- **Authorization — three layers (NFR-SEC-02):** (1) **role** (app roles
  Admin/Manager), (2) **ownership** (managers act only on their own content/team), (3)
  **attribute** (effective group membership = direct ∪ mapped, one source-of-truth view).
  Recomputed every request; **default deny**; documents private until published.
- **Integrity / non-repudiation (ADR-109, NFR-INT):** `signatures`, `quiz_attempts`,
  `policy_approvals`, `audit_log` are append-only — UPDATE/DELETE **revoked from the app
  role**; corrections are new rows. Evidence binds identity + timestamp + exact version.
- **Concurrency:** advisory locks guard race-prone writes (quiz attempts, backups);
  effective membership resolved through a single view to avoid drift.
- **Background work (ADR-114/119):** reminders, sync and backups run in-process on an
  interval, gated by a **Postgres advisory-lock leader election** so exactly one replica
  runs them when scaled out.
- **Configuration (ADR-116):** 12-factor; SPA runtime config injected at container start
  (one image, many environments); secrets from `.env`/Key Vault, never committed.
- **Observability (ADR-115):** structured JSON logs (pino) with a request-id and secret
  redaction; Prometheus `/metrics`; DB-checked `/readyz`; pull/push audit feed.
- **Resilience:** liveness (`/healthz`) never touches the DB; readiness does; rate limits
  at the edge; notification/audit failures never block the triggering action.

## 9. Non-functional summary

Security, privacy, integrity, availability/DR, performance, scalability, observability,
maintainability, usability, compatibility and compliance targets are specified with
status and traceability in [`REQUIREMENTS.md`](REQUIREMENTS.md) §5 (NFR-*) and §6 (TR-*).
Highlights: TLS + strict CSP at the edge; least-privilege DB role; ≥70/60/65% test
coverage gate; controls-as-code proven in CI; rehearsed DR.

## 10. Design principles

1. **Enforce invariants at the strongest layer** — immutability by DB grant, not app code.
2. **Default deny; private by default** — visibility and mutation are opt-in and re-checked.
3. **One source of truth** — effective membership, runtime config, controls catalogue.
4. **Product-neutral seams** — storage, secrets, scheduler and rate-limit stores abstract
   the on-prem realization from the Azure target.
5. **Evidence over assertion** — ledgers, audit feed, and a CI-gated controls report make
   claims verifiable.

## 11. Related documents

- Decisions & alternatives: [`ARCHITECTURE-AND-DECISIONS.md`](ARCHITECTURE-AND-DECISIONS.md)
- Capabilities (ABB/SBB): [`ARCHITECTURE-BUILDING-BLOCKS.md`](ARCHITECTURE-BUILDING-BLOCKS.md), [`../architecture-repository/`](../architecture-repository)
- Implementation detail: [`LLD.md`](LLD.md)
- Requirements & stories: [`REQUIREMENTS.md`](REQUIREMENTS.md), [`USER-STORIES.md`](USER-STORIES.md)
- Diagrams: [`architecture-diagram.mmd`](architecture-diagram.mmd) · [`deployment-diagram.mmd`](deployment-diagram.mmd) · [`request-sequence.mmd`](request-sequence.mmd) · [`data-model.mmd`](data-model.mmd)
- Feature deep-dive: [`approval-workflow/`](approval-workflow/README.md)
