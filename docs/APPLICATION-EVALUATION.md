# Birgma Governance Portal — Application Evaluation

An evidence-based maturity assessment across eighteen engineering, security and
compliance dimensions. Ratings are drawn from the code, tests, CI, ADRs and the
controls-as-code catalogue (`compliance/controls.json`).

> Also live **in-app** at **Admin → Application Evaluation**. This document is the
> source of record; the in-app screen mirrors it.

| | |
|---|---|
| Reviewed | 2026-07-09 |
| Branch | `main @ 7a02b22` |
| Automated tests | 67 (49 API · 18 web + docker-compose smoke e2e) |
| ADRs | 20 |
| Mapped controls | 39 (ISO 27001 · NIST CSF · GDPR · Zero Trust · MITRE ATT&CK; 19 techniques) |

## Summary

| Metric | Value | Note |
|---|---|---|
| **Overall** | **4.3 / 5** | Internal-production-ready |
| Dimensions at ★★★★★ | 6 / 18 | Eleven more at ★★★★☆ |
| Automated tests | 67 | 49 API · 18 web + compose smoke e2e |
| Compliance | 39 controls | CI-gated coverage · 19 ATT&CK techniques |

Rating scale: ★★★★★ Excellent · ★★★★☆ Strong · ★★★☆☆ Adequate · ★★☆☆☆ Partial.

## Scorecard

| # | Dimension | Rating | Evidence | Gaps / next |
|---|---|---|---|---|
| 1 | Functional coverage | ★★★★★ | Policy acknowledgement + version re-sign, quizzes with gated signing, manager trainings & uploads, groups + effective-membership, Entra directory sync, dashboards, pull/push audit feed | Approval workflow designed (ADR-120), not yet built |
| 2 | Architecture & modularity | ★★★★★ | Three-tier (React SPA / Node-Express / PostgreSQL); per-domain route modules; auth/authz/storage/leader/rate-limit extracted; 20 ADRs + TOGAF ABB/SBB | — |
| 3 | Frontend engineering | ★★★★☆ | React 18 + Vite 8; app.jsx decomposed 2,613 → 668 lines into domain modules; ESLint (0 errors); code→friendly-message mapping | JavaScript, not TypeScript; component/render tests thin |
| 4 | Identity & access | ★★★★★ | Entra SSO (MSAL, PKCE); RS256-pinned token validation (issuer/audience/tenant/scope); app-only rejected; app roles; 15-min idle logout | MFA / Conditional Access is Entra-side, not app-enforced |
| 5 | Authorization model | ★★★★★ | Server-enforced RBAC + per-object ownership + effective-group-membership gates; integration-tested; no IDOR found | — |
| 6 | Data & persistence | ★★★★★ | PostgreSQL 16; least-privilege role; append-only signature/audit/quiz ledgers via DB grants; tracked transactional migration runner | — |
| 7 | Security & hardening | ★★★★☆ | Token hardening, parameterized SQL, upload allowlist + server-set type, CSP/headers, single-origin CORS, pluggable rate limiting, no committed secrets | At-rest encryption off by default (host); DNS-rebind SSRF residual; SAST non-blocking; no pen-test |
| 8 | Data protection / GDPR | ★★★★☆ | Per-subject DSAR export; append-only-preserving erasure + retention CLI; data minimization (5-attr Graph, Sites.Selected); drafted ROPA/DPIA/notice | Adopt artefacts (DPO sign-off); breach runbook planned |
| 9 | Compliance frameworks | ★★★★☆ | Controls-as-code: 39 controls mapped to ISO 27001 / NIST CSF / GDPR / Zero Trust / MITRE ATT&CK; CI-gated; AI-framework N/A documented | Zero-Trust pillar write-up + SoA adoption pending |
| 10 | Observability | ★★★★☆ | Structured pino logs + correlation ids + redaction; Prometheus /metrics (RED + runtime); DB-checked /readyz; container healthchecks; log-shipping + alert design | SIEM wiring is an operator step; no distributed tracing yet |
| 11 | Testing | ★★★★☆ | 49 API (node:test unit + integration on real Postgres) + 18 web (vitest) + docker-compose smoke e2e; coverage-gated (78% lines / 70% branches) | No load/perf; UI click-through e2e minimal |
| 12 | CI/CD | ★★★★☆ | Actions: CI (lint/tests/PG integration/coverage), security (gitleaks/Trivy/semgrep + compliance gate), smoke e2e; Dependabot | No automated deploy pipeline (deferred to Azure) |
| 13 | Reliability / HA / DR | ★★★★☆ | Rehearsed DR runbook; off-host DB + uploads backups; app tier stateless-ready (Blob storage, advisory-lock leader election, shared Redis rate-limit) | Single-instance today; no PITR/replication until Azure |
| 14 | Delivery & runtime | ★★★☆☆ | Docker Compose on a Windows VM + nginx edge; per-service resource limits; healthchecks; TLS termination | Single-node; no IaC / k8s; manual deploy; Azure target un-codified |
| 15 | Async / background work | ★★★★☆ | Daily backup + directory sync + reminders on timers; multi-instance-safe via a Postgres advisory-lock leader election | In-process timers, not an external queue (documented) |
| 16 | Governance & documentation | ★★★★★ | Deep architecture + 20 ADRs + ABB/SBB; install / DR / migrations / observability guides; GDPR pack; troubleshooting with a 32-code error catalogue; security review; frameworks | — |
| 17 | Maintainability / DX | ★★★★☆ | Modular API + decomposed frontend; consistent patterns; lint + coverage gates; Dependabot; controls-as-code; no TODO/FIXME debt | Frontend not TypeScript |
| 18 | Supply chain | ★★★★☆ | Committed lockfiles + npm ci; grouped Dependabot; npm audit + Trivy gates; gitleaks with a reviewed allowlist; Managed Identity in production | Dev secret in .env (Key Vault target); semgrep non-blocking |

## Top risks & next steps

| Priority | Item | Why |
|---|---|---|
| Medium | Enable MFA / Conditional Access | The single biggest access control; enforced in Entra, not something the app can guarantee |
| Medium | Turn on at-rest encryption + `PGSSL` | GDPR Art. 32 depends on host BitLocker/CMK and DB-hop TLS — both supported but off by default |
| Medium | Build the approval workflow (ADR-120) | The per-version pre-publication sign-off chain is designed but not yet implemented |
| Low | Adopt the GDPR artefacts | ROPA / DPIA / privacy notice are drafted from real behaviour; they need DPO review and sign-off |
| Low | Incident-response + breach runbook | IR-01 / GDPR-04 are tracked as planned controls (DR exists; security IR does not yet) |
| Low | Azure migration (IaC + CD + managed PG) | Deferred by choice; absorbs CD, HA edge, PITR, private networking and at-rest in one move |

## Verdict

**Strong — production-ready for a single-instance internal deployment.**

A complete, well-architected policy-governance system: Entra-secured, server-enforced
RBAC over append-only compliance ledgers, tested (67 automated tests + a docker-compose
smoke e2e), observable (Prometheus metrics + DB-checked readiness), and documented to a
professional standard (20 ADRs, TOGAF ABB/SBB, full runbooks). HA groundwork makes the
app tier stateless-ready; a rehearsed DR runbook with off-host backups, GDPR
subject-rights tooling, and a CI-gated controls-as-code catalogue (39 controls across
ISO 27001 · NIST CSF · GDPR · Zero Trust · MITRE ATT&CK; ISO 42001 / EU AI Act scoped
out — no AI) round it out. Remaining items are operator or organizational actions
(MFA, at-rest encryption, adopting the GDPR pack) and the deferred Azure migration —
not code defects. The one designed-but-unbuilt feature is the per-version policy
approval workflow (ADR-120).

_Ratings mirror `main @ 7a02b22` at review time; evidence drawn from code, tests, CI and ADRs._
