# Zero Trust Posture — Birgma Governance Portal

_How the portal maps to the Zero Trust pillars of **NIST SP 800-207** and the
**CISA Zero Trust Maturity Model (ZTMM v2)**. Every claim references a control in
the machine-checked catalogue (`compliance/controls.json`, IDs like `IAM-01`) so
this write-up stays honest and regenerable. Companion:
[`SECURITY-FRAMEWORKS.md`](SECURITY-FRAMEWORKS.md), [`SECURITY-REVIEW.md`](SECURITY-REVIEW.md),
[`ISO27001-SOA.md`](ISO27001-SOA.md)._

> **Realizes control ZT-01** (Zero Trust posture mapping). Status: implemented.

---

## 1. Scope & the core principle

This assesses the **Governance Portal as a system**. Several Zero Trust
capabilities (device compliance, network micro-segmentation, the IdP itself) are
**enterprise/Entra/Azure responsibilities** the portal *consumes* — those are
called out explicitly rather than over-claimed.

NIST 800-207's tenets reduce to one rule the portal is built on:

> **No implicit trust. Every request is authenticated, authorized, and
> least-privilege — per request, server-side, regardless of network position.**

The architectural spine is `Entra token validation → policy decision point →
least-privilege data access`, and **no tier trusts another implicitly**: the SPA
holds no authority (all decisions are server-side), the API authenticates to the
database as a non-owner least-privilege role, and the database itself *revokes*
mutation on the evidence ledgers so even the app cannot rewrite them.

CISA ZTMM maturity stages used below: **Traditional → Initial → Advanced →
Optimal**.

---

## 2. Pillar-by-pillar

### 2.1 Identity — **Advanced**
The strongest pillar. Every request carries a delegated Entra token validated on
signature, issuer, audience, tenant, and scope; app-only tokens are rejected.

| Control | What | Status |
|---|---|---|
| IAM-01 | Entra delegated token validation (sig/iss/aud/tenant/scope) | ✅ |
| IAM-02 | App-only tokens rejected (delegated `access_as_user` required) | ✅ |
| IAM-03 | RBAC — `Governance.Admin` / `Governance.Manager` app roles | ✅ |
| IAM-05 | Session hardening — sessionStorage tokens, 15-min idle logout | ✅ |
| IAM-06 | **MFA / Conditional Access** on both app registrations | ◑ Entra-side (operator) |

**Gap → Optimal:** MFA/Conditional Access is enforced in Entra, not by the app
(IAM-06). Enabling phishing-resistant MFA + risk-based Conditional Access is the
single highest-value step and is an operator action.

### 2.2 Devices — **Initial** (mostly inherited)
The portal is a browser SPA + API; it has no device agent. Device trust is a
**Conditional Access** concern (compliant/managed device signals gating sign-in).

| Control | What | Status |
|---|---|---|
| IAM-06 | Device compliance via Conditional Access | ◑ Entra-side (operator) |

**Gap:** device posture is entirely delegated to Entra Conditional Access — the
portal cannot assert it. Documented as an operator responsibility.

### 2.3 Networks — **Initial → Advanced (in progress)**
TLS everywhere at the edge; the datastore is not publicly exposed. Private
network paths and the internal DB-hop TLS are the maturation items.

| Control | What | Status |
|---|---|---|
| DAT-03 | Encryption in transit at the edge (TLS 1.2/1.3) | ✅ |
| APP-05 | Rate limiting (pluggable in-memory / shared Redis) | ✅ |
| NET-01 | Database not publicly exposed (loopback-only) | ◑ partial |
| DAT-05 | TLS on the API→PostgreSQL hop (`PGSSL=require`) | ◑ partial (off by default) |
| NET-02 | Private network path to managed data services (Azure Private Endpoint) | ○ planned (Azure) |

**Gap → Advanced/Optimal:** turn on `PGSSL=require` now; adopt Private Endpoints
+ network isolation with the Azure migration (NET-02).

### 2.4 Applications & Workloads — **Advanced**
Per-object authorization, hardened I/O, and a gated delivery pipeline.

| Control | What | Status |
|---|---|---|
| IAM-03 / IAM-04 | RBAC + per-object ownership + effective-group-membership gates | ✅ |
| APP-01 | Parameterized SQL throughout | ✅ |
| APP-02 | Upload allowlist + server-derived Content-Type + nosniff | ✅ |
| APP-03 | CSP + security headers (helmet + nginx) | ✅ |
| APP-04 | Single-origin CORS; bearer-only (no cookie/CSRF surface) | ✅ |
| APP-06 | Catalogued error handling (no stack leaks; requestId) | ✅ |
| GOV-01 | Change management via PR + CI gates (lint/tests/coverage/scan/smoke) | ✅ |
| SUP-01 / SUP-02 | Dependency/secret scanning; SAST | ✅ / ◑ |
| APP-07 | Outbound SSRF guard on admin forward URL | ◑ partial (DNS-rebind residual) |

**Gap:** make SAST blocking (SUP-02), close the DNS-rebind SSRF residual (APP-07).

### 2.5 Data — **Advanced**
The portal's centre of gravity. Evidence is append-only *at the database
privilege layer*; access is least-privilege; collection is minimized.

| Control | What | Status |
|---|---|---|
| DAT-01 | Append-only ledgers via DB grants (signatures / audit / quiz / approvals) | ✅ |
| DAT-02 | Least-privilege database role (non-owner, table-scoped) | ✅ |
| DAT-06 | Data minimization (5-attribute Graph read; `Sites.Selected`) | ✅ |
| IAM-04 | Per-object data authorization | ✅ |
| GDPR-01 / GDPR-02 | Subject access/portability; lawful erasure + retention | ✅ |
| DAT-04 | **Encryption at rest** (DB volume, backups, uploads) | ◑ host-side (operator) |

**Gap → Optimal:** enable at-rest encryption (BitLocker/CMK) — supported, off by
default (DAT-04). Data classification/labelling is an ISMS activity (see the SoA).

---

## 3. Cross-cutting capabilities

### 3.1 Visibility & Analytics — **Advanced (aggregation pending)**
| Control | What | Status |
|---|---|---|
| LOG-01 | Structured logs + correlation ids + secret redaction | ✅ |
| LOG-02 | Append-only admin audit log (token-bound actor) | ✅ |
| LOG-04 | Metrics + health/readiness probes (RED + runtime) | ✅ |
| LOG-03 | Log shipping to SIEM + alert rules | ◑ partial (operator wiring) |

**Gap:** ship logs/metrics to a SIEM and enable alerting (LOG-03).

### 3.2 Automation & Orchestration — **Advanced**
Gated CI/CD, transactional migrations, HA-safe scheduled jobs, tested DR.

| Control | What | Status |
|---|---|---|
| GOV-01 | PR + CI gates | ✅ |
| OPS-02 | Tracked, transactional schema migrations | ✅ |
| OPS-04 | Single-leader schedulers via Postgres advisory lock | ✅ |
| OPS-01 | Automated + tested backups / DR | ✅ |

### 3.3 Governance — **Advanced**
Controls expressed as data and verified in CI; decisions recorded as ADRs; this
posture and the ISO SoA are living artefacts.

- `compliance/controls.json` + `report.mjs` (CI-gated coverage) · 20 ADRs ·
  TOGAF ABB/SBB · [`REQUIREMENTS.md`](REQUIREMENTS.md) · [`ISO27001-SOA.md`](ISO27001-SOA.md).

---

## 4. Maturity summary

| Pillar / capability | Maturity | Primary gap (owner) |
|---|---|---|
| Identity | **Advanced** | MFA / Conditional Access — IAM-06 (operator) |
| Devices | Initial | Device compliance via Entra CA (operator) |
| Networks | Initial→Advanced | `PGSSL`, Private Endpoint — DAT-05 / NET-02 |
| Applications & Workloads | **Advanced** | Blocking SAST, SSRF residual — SUP-02 / APP-07 |
| Data | **Advanced** | At-rest encryption — DAT-04 (operator) |
| Visibility & Analytics | Advanced | SIEM shipping/alerting — LOG-03 (operator) |
| Automation & Orchestration | **Advanced** | — |
| Governance | **Advanced** | — |

**Overall: Advanced**, with the remaining lift concentrated in **operator/org
actions** (MFA, at-rest encryption, SIEM) and the **Azure network isolation**
already on the roadmap — not application defects.

---

## 5. Roadmap to Optimal (prioritized)

1. **Enable MFA / Conditional Access** (IAM-06) — biggest control, operator, Entra.
2. **At-rest encryption + `PGSSL=require`** (DAT-04 / DAT-05) — GDPR Art. 32.
3. **SIEM shipping + alerting** (LOG-03) — turns visibility into detection.
4. **Azure Private Endpoints / network isolation** (NET-02) — with the migration.
5. **Breach + incident-response runbooks** (GDPR-04 / IR-01) — see the SoA A.5.24–5.26.

_Generated from the control catalogue; regenerate coverage with
`node compliance/report.mjs`._
