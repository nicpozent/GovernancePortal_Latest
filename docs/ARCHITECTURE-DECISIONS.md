# Birgma Governance Portal — Architecture Decisions & Frameworks

The technology choices and the reasoning behind them, in lightweight ADR form.
Each record: context → decision → why → trade-offs.

---

## Frameworks & libraries (the stack)
| Layer | Technology | Role |
|------|-----------|------|
| Frontend | **React 18** + **MSAL.js** (Microsoft Authentication Library) | SPA UI; Entra ID sign-in (OIDC/OAuth2, PKCE) |
| Frontend build | **Vite** + `@vitejs/plugin-react` | Precompiles JSX, bundles & self-hosts React/MSAL |
| Web tier | **nginx** | TLS termination, serves the SPA, reverse-proxies `/api` |
| API tier | **Node.js** + **Express** | Token validation, RBAC, all domain logic |
| Auth/validation | **jsonwebtoken** + **jwks-rsa** | Verify Entra JWTs (signature/issuer/audience/tenant/scope) |
| Integration | **@microsoft/microsoft-graph-client** | Directory sync, SharePoint docs, sendMail |
| Uploads | **multer** | Manager file uploads (extension-allowlisted) |
| Data | **PostgreSQL 16** | Relational store; append-only ledgers |
| Runtime | **Docker Compose** on **WSL2** (Windows VM) | Three-container orchestration |

---

## ADR-001 — Microsoft Entra ID for identity (not custom auth)
**Context:** Birgma/Biltema is a Microsoft 365 shop; users already have work accounts.
**Decision:** Delegate all authentication to Entra ID; the app holds no passwords.
**Why:** SSO, MFA/Conditional Access, lifecycle (joiner/mover/leaver) and audit all
live in Entra. App roles (`Governance.Admin`, `Governance.Manager`) drive authorization;
group-to-role assignment makes onboarding = group membership.
**Trade-offs:** Hard dependency on Entra availability and correct app-registration setup;
group-based role assignment needs Entra ID P1.

## ADR-002 — Three-container split (web / api / db)
**Context:** Need clear separation of concerns and a small attack surface.
**Decision:** nginx serves the SPA and proxies `/api` to Node; Node is the only thing
that talks to the DB, Graph and SharePoint; Postgres is internal-only.
**Why:** Same-origin SPA→API (no CORS), one place for token checks + RBAC, DB never
exposed. Each tier scales/restarts independently.
**Trade-offs:** Slightly more moving parts than a monolith; mitigated by Compose.

## ADR-003 — PostgreSQL with append-only ledgers
**Context:** Compliance evidence must be trustworthy.
**Decision:** Relational schema; `signatures`, `audit_log`, `quiz_attempts`,
`notifications_sent` are insert-only (no UPDATE/DELETE grant to the app role).
**Why:** Non-repudiation and a tamper-evident audit trail; the app's least-privilege
role physically cannot rewrite history.
**Trade-offs:** Corrections happen by new rows, not edits (intentional).

## ADR-004 — Reuse the `policies` table for trainings/uploads
**Context:** Managers upload trainings/policies that behave like admin policies
(assign, deadline, quiz, sign) but are file-backed, not SharePoint-backed.
**Decision:** One table with `doc_type` (+ `source='Upload'`, `upload_*`, `owner_oid`)
rather than a parallel "trainings" table.
**Why:** All compliance, reminder, quiz and reporting logic works unchanged; one code
path. **Trade-offs:** A broad table; mitigated by clear columns and `source`.

## ADR-005 — SharePoint via Graph `Sites.Selected` (least privilege)
**Context:** Policy documents live in one SharePoint site.
**Decision:** Read documents through Microsoft Graph scoped with `Sites.Selected` to
that one site (not tenant-wide read).
**Why:** The app can only see the one governance site; documents stay in SharePoint as
the system of record. **Trade-offs:** A one-time per-site permission grant step.

## ADR-006 — Directory sync: SCIM-first, Graph fallback (tiered)
**Context:** Reading the whole directory is over-privileged.
**Decision:** Support SCIM provisioning (Entra pushes only assigned users; zero Graph
directory permissions) as the preferred tier, with AU-scoped Graph as fallback.
**Why:** Minimizes standing permissions. **Trade-offs:** SCIM needs enterprise-app
provisioning config; documented in `IMPLEMENTATION_GUIDE.md`.

## ADR-007 — Email via Graph `sendMail` (no SMTP infra)
**Context:** Need reminders + acknowledgement confirmations.
**Decision:** Send from a mailbox via Graph `Mail.Send`; a daily job handles
assignment/20/15/7/1-day/overdue reminders + review reminders; confirmations are
fire-and-forget on sign.
**Why:** No SMTP server to run; reuses the Entra identity. Idempotent via
`notifications_sent`. **Trade-offs:** `Mail.Send` is broad — restrict with an Exchange
Application Access Policy to the one mailbox.

## ADR-008 — Vite build, self-hosted libraries
**Context:** The SPA originally loaded React/MSAL/Babel from a CDN and compiled JSX in
the browser (needed CSP `unsafe-eval`; broke without internet).
**Decision:** Build with Vite; bundle and self-host React/MSAL; precompile JSX.
**Why:** Faster load, works air-gapped, and lets the CSP drop `unsafe-eval` and CDN
sources. **Trade-offs:** Introduces a Node build step (multi-stage Docker build).

## ADR-009 — Docker Compose on a Windows VM (not Azure yet)
**Context:** Must run on existing on-prem VMware Windows infrastructure.
**Decision:** Containers via Docker Desktop/WSL2 on a Windows VM; secrets in `.env`,
TLS certs on disk.
**Why:** Fits current infra and skills; simple to operate. **Trade-offs:** Secrets on
disk and host-level DB access are the weak points — see the Azure-native path below.

## ADR-010 — Unassigned documents are private
**Context:** "No group = everyone" risked accidental company-wide exposure and made
restricted material readable by direct link.
**Decision:** A document with no group assignment is visible only to admins/owner;
reads of document/file/quiz require effective group membership.
**Why:** Explicit audiences; restricted trainings stay private. Company-wide is done
via the **All Employees** group. **Trade-offs:** You must populate "All Employees"
(map an all-staff AD group) for true company-wide reach.

---

## Target evolution — Azure-native (most secure)
The code already supports it: host on App Service / Container Apps with a **Managed
Identity** (`DefaultAzureCredential` → no stored client secret), **Key Vault** for the
DB connection string, **Azure Database for PostgreSQL** behind a **Private Endpoint**
(TLS enforced), fronted by Front Door/App Gateway (WAF), with **Conditional Access**
(MFA/compliant device). This removes the two on-prem weak points (secrets on disk,
host DB access). See `NEXT-STEPS.md` and `IMPLEMENTATION_GUIDE.md` §7.
