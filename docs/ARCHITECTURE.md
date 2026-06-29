# Birgma Governance Portal — Solution Architecture

_An enterprise-architecture view: components, authentication, domain layers, and security posture._

---

## 1. Purpose
A policy-governance portal: administrators publish governance documents (stored in
SharePoint), assign them to groups, optionally attach knowledge-check quizzes and
deadlines; employees read and **acknowledge** them; the system maintains an
append-only compliance record and reports on it.

## 2. Logical architecture (three tiers + identity)

```
                         ┌──────────────────────────── Microsoft Entra ID ──────────────────────────┐
                         │  SPA app reg (PKCE)      API app reg (access_as_user, Governance.Admin)   │
                         │  Microsoft Graph (users, groups, SharePoint)                              │
                         └───────────────▲───────────────────────────▲──────────────────────────────┘
                                         │ OIDC/OAuth2 (tokens)       │ Graph (app-only / Managed Id)
   Browser (SPA)                         │                            │
   React + MSAL.js  ──── HTTPS ────►  web tier (nginx)  ──── /api ──►  app tier (Node/Express)  ──►  data tier (PostgreSQL)
   (acquires token)    same-origin      static SPA + reverse proxy     domain logic, validation       schema + append-only ledgers
                                        TLS termination, CSP, headers   token validation, RBAC
```

- **Presentation tier** — single-page React app (MSAL.js for sign-in), served as static files by **nginx**. nginx terminates TLS, applies security headers/CSP, and **reverse-proxies `/api`** to the app tier (so the browser is always same-origin — no CORS).
- **Application tier** — **Node.js / Express** API. Validates every request's Entra token, enforces role-based authorization, holds all domain logic, and is the *only* component that talks to the database and to Microsoft Graph.
- **Data tier** — **PostgreSQL 16**. Owns the schema; the app connects as a least-privilege role; compliance-critical tables are append-only.
- **Identity & integration** — **Microsoft Entra ID** for authentication and app roles; **Microsoft Graph** for directory sync (users/groups/managers) and SharePoint document metadata.

All three tiers run as containers (`web`, `api`, `db`) on a single Docker host; inter-tier traffic stays on the internal Docker network.

## 3. Authentication & authorization mechanism

1. **Sign-in (delegated, PKCE).** The SPA uses MSAL.js against the **SPA app registration**. The user authenticates with Entra (SSO); the browser receives an **access token** scoped to the API (`api://<api-id>/access_as_user`).
2. **Bearer on every call.** The SPA attaches `Authorization: Bearer <token>` to each `/api` request.
3. **Server-side validation** (`auth.js`) on every request: verifies the **JWT signature** against Entra's JWKS, and checks **issuer** (v2.0), **audience** (this API), **tenant** (`tid`), and presence of the **`access_as_user`** scope. Identity (`oid`, name, UPN) is taken from the *verified* token — never trusted from the client.
4. **Authorization (RBAC).** Administrative endpoints require the **`Governance.Admin`** app role (assigned in Entra). Employees can only read/sign their own required policies and see their own data.
5. **Service-to-service (Graph).** The API calls Graph **app-only**: a client secret on the VM model, or a **Managed Identity** (`DefaultAzureCredential`) on the Azure model — least privilege via `Sites.Selected` for SharePoint and explicit application permissions for directory reads.
6. **Session lifetime.** Tokens live ~1h; the SPA enforces a **15-minute idle timeout** (local sign-out) with a 60-second warning.

## 4. Domain layers (DDD-style)

- **Identity & directory** — `employees` (synced from Entra/AD, with legal + functional managers), `groups` (Platform / Directory / Local), `employee_groups`, `group_mappings`, and the `group_effective_members` roll-up. Owns "who exists and who belongs where."
- **Policy management** — `policies` (name, type, version, SharePoint refs, deadlines), `policy_groups` (assignment), archive lifecycle. Owns "what must be acknowledged and by whom."
- **Knowledge checks** — `quizzes`, `quiz_questions`, `quiz_attempts`. Owns "comprehension gating before signing."
- **Compliance ledger** — `signatures` (append-only, version-stamped). The system of record; "required = members of assigned groups (or everyone if unassigned); signed = signed the current version."
- **Notifications** — `notifications_sent` + the reminder engine. Owns "who has been told, and when."
- **Audit & operations** — `audit_log` (append-only admin actions), `sync_runs`, backups. Owns "accountability and recoverability."

Cross-cutting: directory sync (Graph → directory layer), SharePoint resolution (policy layer → Graph), and the reporting/aggregation queries that join policy + identity + ledger.

## 5. Key flows
- **Acknowledge:** read (SharePoint) → pass quiz (if any, server-graded) → sign → append-only `signatures` row (version + timestamp + identity from token).
- **Sync:** scheduled/manual Graph read of app-assigned users & groups → upsert `employees`/`groups`/`employee_groups`.
- **Compliance:** `required = eff_members(assigned groups) ∪ all-active(if unassigned)`; `signed = signatures at current version`; surfaced by policy / unit / group and exported as CSV.
- **Reminders:** daily engine computes each required-unsigned employee's personal due date and sends the due-milestone email once (idempotent via `notifications_sent`).

## 6. Security posture (enterprise view)
- **Confidentiality in transit** — TLS browser↔nginx; internal hops stay on the host's Docker network.
- **Least privilege** — DB app role is non-owner with table-scoped grants; `signatures`, `audit_log`, `quiz_attempts` are **append-only** (no UPDATE/DELETE for the app). Graph access is `Sites.Selected` + explicit application permissions only.
- **Integrity & non-repudiation** — signatures are immutable, version-stamped, identity-bound to the verified token; all admin actions are audited.
- **Token hardening** — signature/issuer/audience/tenant/scope all enforced; wrong-tenant or app-only tokens rejected.
- **Availability/recovery** — automated daily DB backups (retained), manual + full-application backups, health probe.
- **Hardening roadmap** (see NEXT-STEPS.md) — internalize the DB port, secrets in Key Vault + Managed Identity, Private Endpoint, Conditional Access, CDN-library vendoring + stricter CSP, and a finer-grained role model (e.g. a Compliance role).

## 7. Deployment models
- **On-prem VM (current):** three Docker containers on a Windows VM (WSL2). Secrets in `.env`; simplest to operate.
- **Azure-native (target for scale/assurance):** App Service / Container Apps with **Managed Identity** (no stored secret), **Key Vault**, **Azure Database for PostgreSQL** behind a **Private Endpoint**, fronted by Front Door/App Gateway. The code already supports this via `DefaultAzureCredential`. See `birgma-governance/IMPLEMENTATION_GUIDE.md` §7.

## 8. Technology summary
React + MSAL.js · nginx · Node.js/Express · PostgreSQL 16 · Microsoft Entra ID (OIDC/OAuth2) · Microsoft Graph · Docker Compose.
