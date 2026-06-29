# Birgma Governance Portal — Architecture Building Blocks (ABBs)

_A TOGAF-aligned derivation of the reusable, technology-neutral capabilities this
solution embodies, and how each is realized here. Companion to
[`ARCHITECTURE-AND-DECISIONS.md`](ARCHITECTURE-AND-DECISIONS.md)._

---

## 1. Why this document exists (and what an ABB is)

In TOGAF terms a delivered system is a set of **Solution Building Blocks (SBBs)** —
specific products and code (Entra ID, PostgreSQL, this `routes.js`). An
**Architecture Building Block (ABB)** is the level above: a **capability defined
independently of any product** — its fundamental function, its interfaces, its
dependencies, and the standards/NFRs it must meet.

ABBs matter to the enterprise because they are **reusable and portable**. "Immutable
Audit Ledger" or "Policy Decision Point" are capabilities many systems need; naming
them as ABBs lets the enterprise reuse the *pattern and requirements* across
projects and swap the *realization* without re-architecting.

This solution is a good source of ABBs precisely because its decision records
already separate capability from product — each ADR lists the alternatives that
were rejected, which is the seam between the ABB (the need) and the SBB (the choice).
For example, ADR-108 weighs PostgreSQL vs SQL Server vs Mongo: the **ABB** is
"Relational Compliance Datastore with privilege-based integrity"; the **SBB** is
PostgreSQL 16.

### Derivation method
ABBs below were derived two ways and cross-checked:
1. **Top-down** from the business capability the portal delivers (govern → assign →
   attest → verify → prove), decomposed into supporting application/data/technology
   capabilities.
2. **Bottom-up** from the decision records and code, abstracting each SBB to the
   product-neutral capability it satisfies.

---

## 2. ABB catalogue by architecture domain

Each row: the **ABB** (neutral capability) → the **SBB** that realizes it here →
**reuse note** (is this capability reusable enterprise-wide, or solution-specific?).
Realization references point at where it lives in the code.

### 2.1 Business Architecture ABBs (capabilities)

| ABB | Realizing SBB (this project) | Reuse note |
|-----|------------------------------|------------|
| **B1 Policy Lifecycle Management** — author, version, assign, review, retire governance documents | `policies` + `policy_versions` + archive flow; SharePoint as source of record | Reusable across any document-governance domain |
| **B2 Compliance Attestation** — capture a binding "read & understood" act | `signatures` append-only ledger; sign flow | **Highly reusable** (HR, security, ISO, training) |
| **B3 Competency Verification** — gate attestation on demonstrated understanding | quizzes + server-side grading + pass gate | Reusable as a standalone assessment capability |
| **B4 Obligation Assignment & Targeting** — express *who must do what* | groups + `policy_groups` + effective membership | Reusable wherever obligations target populations |
| **B5 Delegated Management (Org Scope)** — managers act only on their team/content | `requireManager` + `canManage` + `teamOids` | Reusable delegation/scoping pattern |
| **B6 Notification & Escalation** — drive people to fulfil obligations on a schedule | reminder engine + milestone ladder | **Highly reusable** |
| **B7 Compliance Reporting & Assurance** — prove status to auditors/leaders | dashboards, by-unit/by-group, CSV export | Reusable analytics-over-obligations capability |
| **B8 Accountability / Non-repudiation** — defensible record of who did what | `audit_log` (append-only) + signature binding | **Highly reusable** governance primitive |

### 2.2 Data Architecture ABBs

| ABB | Realizing SBB | Reuse note |
|-----|---------------|------------|
| **D1 Identity & Org Master Data** — person, group, membership, manager graph | `employees`, `groups`, `employee_groups`, `group_mappings`, `group_effective_members` | Consumes an enterprise IdP/HR master; reusable shape |
| **D2 Obligation Catalogue** — governed items + their targeting + versions | `policies`, `policy_groups`, `policy_versions` | Reusable |
| **D3 Immutable Attestation Ledger** — version-stamped, identity-bound, append-only | `signatures` (UPDATE/DELETE revoked at grant level) | **Enterprise-reusable integrity pattern** |
| **D4 Immutable Audit Ledger** — append-only event-of-record | `audit_log` (UPDATE/DELETE revoked) | **Enterprise-reusable** |
| **D5 Assessment Results Store** | `quiz_attempts` (append-only) | Reusable |
| **D6 Notification State Store** — idempotency of outbound comms | `notifications_sent` | Reusable pattern (exactly-once-ish messaging) |
| **D7 Integration/Config State** | `integration_config`, `sync_runs` | Solution-specific |

### 2.3 Application Architecture ABBs (services/components)

| ABB | Realizing SBB | Reuse note |
|-----|---------------|------------|
| **A1 Identity Federation / Token Validation** — verify a federated access token (sig/issuer/audience/tenant/scope) | `auth.js` over `jsonwebtoken`+`jwks-rsa` | **Enterprise-reusable** (any OAuth2 RS) |
| **A2 Policy Decision Point (PDP)** — authorize an action from role + ownership + attribute (membership) | `requireAdmin`/`requireManager` + `canRead`/`canManage` | **Enterprise-reusable** authZ pattern |
| **A3 Edge / API Gateway** — TLS, security headers/CSP, same-origin reverse proxy, rate limiting | nginx + `helmet` + `express-rate-limit` | **Enterprise-reusable** |
| **A4 Presentation / Experience** — authenticated SPA shell | React + MSAL.js | Reusable shell pattern |
| **A5 Directory Synchronization** — reconcile external identities/groups into local master, least-privilege | `services/sync.js` (Graph) + SCIM option | **Enterprise-reusable** |
| **A6 Content Access Broker** — mediate access to documents held in an external DMS | `services/sharepoint.js` (Graph drive items) | Reusable DMS-brokerage pattern |
| **A7 Outbound Notification Service** — send transactional messages via a platform | `services/reminders.js` (Graph `sendMail`) | **Enterprise-reusable** |
| **A8 Integration / Event Distribution** — push (webhook) + pull (authenticated feed) of domain events | `logger.forwardEvent` + `/feed/audit` | Reusable eventing pattern |
| **A9 Backup & Recovery Service** | scheduled `pg_dump` + retention + restore path | **Enterprise-reusable** |
| **A10 Scheduling / Task Orchestration** | in-process schedulers (ADR-114) | Reusable capability; *current SBB is single-instance only* |
| **A11 Observability / Audit Forwarding** — structured logs + correlation id + SIEM feed | `pino`/`pino-http` + forward/feed | **Enterprise-reusable** |

### 2.4 Technology Architecture ABBs (platform/infrastructure)

| ABB | Realizing SBB | Reuse note |
|-----|---------------|------------|
| **T1 Identity Provider (OIDC/OAuth2)** | Microsoft Entra ID | Enterprise-shared service |
| **T2 HTTP Edge / TLS Termination** | nginx | Reusable |
| **T3 Application Runtime / Container Platform** | Node 22 + Docker (Compose; Azure Container Apps target) | Reusable |
| **T4 Relational DBMS with privilege-based access control** | PostgreSQL 16 | Reusable |
| **T5 Object / File Storage** | mounted volume (Azure Blob target) | Reusable |
| **T6 Directory & Collaboration Platform** | Microsoft Graph (Entra/SharePoint/Exchange) | Enterprise-shared service |
| **T7 Secrets Management** | `.env` on disk now → **Key Vault target** | **Enterprise-shared; weakly realized today (gap)** |
| **T8 Log Aggregation / SIEM** | stdout JSON → external SIEM (via feed/forward) | Enterprise-shared service |

---

## 3. Fully-specified ABBs (the high-value, reusable ones)

These four are the capabilities most worth lifting into an enterprise repository.
Specified in the TOGAF ABB style: function, interfaces, dependencies, attributes,
standards — **deliberately product-free**, with this project's realization noted
last.

### ABB A1 — Identity Federation / Token Validation
- **Fundamental functionality.** Establish caller identity by validating a
  federated access token on every request: cryptographic signature, issuer,
  audience, tenant/realm, token type (delegated vs application), and required scope.
  Expose verified identity + roles to downstream components; trust nothing
  client-asserted.
- **Interfaces.** *Provided:* `authenticate(request) → Principal{subject, name,
  roles, scopes}` (middleware). *Required:* IdP discovery/JWKS endpoint; clock.
- **Dependencies.** ABB T1 (IdP). Upstream of A2 (PDP).
- **Key attributes / NFRs.** Stateless; key set cached with TTL; constant
  per-request overhead; fail-closed (no token ⇒ 401). Pin signing algorithm to
  defeat alg-confusion.
- **Standards.** OAuth 2.0, OIDC, JWT (RFC 7519), JWKS (RFC 7517).
- **Realized here by.** `apps/api/src/auth.js` (`jsonwebtoken` + `jwks-rsa`),
  rejecting app-only tokens and foreign tenants.

### ABB A2 — Policy Decision Point (Authorization)
- **Fundamental functionality.** Decide whether a principal may perform an action
  on a resource by combining **role** (coarse capability), **ownership** (relation
  to the resource) and **attributes** (effective group membership). Default deny.
- **Interfaces.** *Provided:* `can(principal, action, resource) → permit/deny`
  (here: `requireAdmin`, `requireManager`, `canRead`, `canManage`). *Required:*
  verified principal (A1); identity/obligation data (D1/D2).
- **Dependencies.** A1, D1, D2.
- **Key attributes.** Decisions recomputed server-side every call; never inferred
  from client state; private-by-default for unscoped resources.
- **Standards.** RBAC (NIST), ABAC concepts (XACML-style PEP/PDP separation).
- **Realized here by.** middleware + `canRead`/`canManage` in `routes.js`. *Note:
  currently an embedded PDP, not a standalone service — see §5.*

### ABB D3/D4 — Immutable Ledger (Attestation & Audit)
- **Fundamental functionality.** Persist domain-significant events as an
  **append-only**, tamper-evident record bound to a verified identity, a timestamp,
  and (for attestations) the exact version of the thing acted upon. Corrections are
  new records, never edits.
- **Interfaces.** *Provided:* `append(event)`, `read(query)`. *Explicitly not
  provided:* update, delete.
- **Dependencies.** A relational store whose **access-control model can revoke
  mutation** from the writing principal (T4).
- **Key attributes / NFRs.** Immutability enforced at the **privilege layer**, not
  application discipline; non-repudiation; queryable for assurance/export.
- **Standards.** Supports ISO 27001 A.8.15 (logging), GDPR Art.5 integrity,
  WORM/audit expectations.
- **Realized here by.** `signatures`, `audit_log`, `quiz_attempts` with
  `revoke update, delete … from governance_app` (`db/docker-grants.sql`).

### ABB A5 — Directory Synchronization (least-privilege)
- **Fundamental functionality.** Reconcile the authoritative external directory
  into the local identity master — only for principals **in scope** for this
  application — handling joiners/movers/leavers (deactivate, never delete).
- **Interfaces.** *Provided:* `sync() → {added, updated, deactivated}`; status feed.
  *Required:* directory read **or** a push provisioning endpoint.
- **Dependencies.** T6 (directory platform), D1 (identity master).
- **Key attributes.** Least privilege (assigned-principals-only / SCIM push / AU
  scoping); idempotent; auditable (`sync_runs`); retains history on offboarding.
- **Standards.** SCIM 2.0 (push tier); least-privilege (ISO A.8.2).
- **Realized here by.** `services/sync.js` (Graph, app-assigned only) + the SCIM
  endpoint option.

---

## 4. Capability dependency map

How the ABBs stack (arrows = "depends on / consumes"):

```
                         T1 IdP        T6 Directory/Collab     T7 Secrets   T8 SIEM
                          │                 │                     │           ▲
                          ▼                 ▼                     ▼           │
  A4 Experience ─► A3 Edge ─► A1 Token Validation ─► A2 PDP ─► (Business ABBs B1–B8)
                                                       │
                          ┌───────────────────────────┼───────────────────────────┐
                          ▼                ▼           ▼              ▼             ▼
                    A5 Dir Sync     A6 Content Broker  A7 Notify   A8 Integration  A9 Backup
                          │                │             │             │             │
                          ▼                ▼             ▼             ▼             ▼
                    D1 Identity      (DMS via T6)   D6 Notif state  D3/D4 Ledgers  T4 RDBMS
                                                                    D2 Catalogue
   A10 Scheduling drives A5/A7/A9 on a timer · A11 Observability is cross-cutting over all.
```

The spine is **T1 → A1 → A2 → Business ABBs**: nothing reaches a business capability
without passing identity federation and the policy decision point. That single
chokepoint is the architecture's central control and its central assurance argument.

---

## 5. Realization maturity & gaps (the EA's honest read)

Deriving ABBs also exposes where a needed capability is **present but immature** or
**implicit** — useful input to a roadmap:

| ABB | Maturity | Note / target |
|-----|----------|---------------|
| A2 Policy Decision Point | **Embedded** | Correct and consistent, but spread across handlers as helpers, not a discrete PDP. A reusable policy module (or externalized PDP) would let other apps share it. The duplicated effective-membership query is the symptom (root cause of finding M-1). |
| A10 Scheduling | **Single-instance** | In-process timers can't run in >1 replica (ADR-114). Target: platform scheduler / singleton job before horizontal scale. |
| T7 Secrets Management | **Weak** | Secrets on disk (`.env`). Target: Key Vault + Managed Identity — the code already supports `DefaultAzureCredential`. |
| T5 Object Storage | **Local** | Volume on one host; no replication. Target: Azure Blob. |
| A8 Integration / Eventing | **Basic** | Fire-and-forget webhook + pull feed; no delivery guarantees/retry/DLQ. Adequate for audit forwarding; would need hardening if used for critical integration. |
| T8 SIEM | **Optional** | Structured logs + feed exist; aggregation/alerting is an org deployment (monitoring gap noted in `SECURITY-REVIEW.md`). |

The remaining ABBs (A1, A3, A5, A6, A7, A9, D1–D6, B1–B8) are **production-grade**
in their current realization.

---

## 6. How these feed the Enterprise Continuum (reuse)

The ABBs marked **enterprise-reusable** above are candidates to promote into a shared
**Architecture Repository** so other Birgma solutions inherit the pattern and its
NFRs rather than reinventing them:

- **A1 Token Validation** and **A2 PDP** → a standard "secured M365-federated API"
  reference architecture (any internal API).
- **D3/D4 Immutable Ledger** → the enterprise pattern for *any* system needing
  defensible audit/attestation (procurement approvals, access reviews, sign-offs).
- **A5 Directory Synchronization** and **A7 Notification** → shared services usable
  by multiple line-of-business apps.
- **A3 Edge/Gateway** and **A9 Backup/Recovery** → baseline operational ABBs every
  solution should adopt.

Conversely, the **T-domain ABBs** (T1 IdP, T6 Graph, T7 Key Vault, T8 SIEM) are
*already* enterprise-shared services this solution **consumes** — which is exactly
the desired shape: a line-of-business solution built mostly from shared technology
ABBs plus a thin set of solution-specific business/data ABBs.

---

## 7. Summary

Yes — clean ABBs fall out of this project because it was built with capability/
product separation already in mind. The reusable core is: **federated token
validation → a policy decision point → an immutable ledger**, surrounded by
directory-sync, content-brokerage, notification, and integration services, all
consuming enterprise-shared technology ABBs (IdP, directory/collab platform,
secrets, SIEM). The solution-specific value sits almost entirely in the **Business**
and **Data** domains (policy lifecycle, attestation, obligation targeting); the
**Application** and **Technology** domains are largely reusable building blocks the
wider enterprise can adopt.

_Derived from the codebase and decision records on the
`claude/code-review-best-practices` branch; product-neutral by design so the
capability survives any future re-platforming._
