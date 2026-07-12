# ISO/IEC 27001:2022 — Statement of Applicability (SoA)

_Scope: the **Birgma Governance Portal** as a system within the organisation's
ISMS. Every "Implemented/Partial" row references a control in the machine-checked
catalogue (`compliance/controls.json`, e.g. `IAM-01`) or an ADR/runbook, so the
SoA is verifiable and regenerable. Companion: [`ZERO-TRUST.md`](ZERO-TRUST.md),
[`SECURITY-FRAMEWORKS.md`](SECURITY-FRAMEWORKS.md), [`SECURITY-REVIEW.md`](SECURITY-REVIEW.md)._

> **Realizes control GOV-02** (ISO 27001 Statement of Applicability).

## How to read this

- **Applicable** — Y (in scope) / N (justified exclusion).
- **Status** — how the control is met *for this system*:
  - **Implemented / Partial / Planned** — realized in code/config (catalogue ID given).
  - **Organizational (ISMS)** — owned by the wider ISMS/HR/management; the portal may *support* it (noted).
  - **Inherited** — provided by the hosting platform (Azure / VM host / org facilities).
  - **Excluded** — not applicable, with justification.

Scope note: the portal is one application. Enterprise-wide controls (HR, physical,
supplier governance, the IdP itself) are **owned by the ISMS**; the portal
contributes evidence or enforcement where noted. A.6 (People) and A.7 (Physical)
are therefore largely Organizational/Inherited by design.

---

## A.5 Organizational controls (37)

| # | Control | Appl. | Status | Justification / implementation |
|---|---------|:--:|--------|-------------------------------|
| 5.1 | Policies for information security | Y | Organizational (supported) | ISMS owns the policy set; **the portal is the tool that distributes and attests them** (its core function) |
| 5.2 | Roles & responsibilities | Y | Organizational (enforced) | Enforced in-app via app roles — IAM-03 |
| 5.3 | Segregation of duties | Y | Partial | RBAC (IAM-03) + author-vs-approver split in the approval workflow (ADR-120); broader SoD is ISMS |
| 5.4 | Management responsibilities | Y | Organizational | ISMS |
| 5.5 | Contact with authorities | Y | Organizational | ISMS (incl. GDPR supervisory authority) |
| 5.6 | Contact with special interest groups | Y | Organizational | ISMS |
| 5.7 | Threat intelligence | Y | Organizational (supported) | Dependabot/Trivy advisories feed the app — SUP-01 |
| 5.8 | Information security in project management | Y | Implemented | ADRs, ABB/SBB, `REQUIREMENTS.md`, secure-by-design gates — GOV-01 |
| 5.9 | Inventory of assets | Y | Organizational (supported) | The portal is a registered asset; it inventories policies/trainings/employees/groups as data |
| 5.10 | Acceptable use | Y | Organizational | ISMS |
| 5.11 | Return of assets | Y | Organizational (supported) | Leaver deactivation via directory sync |
| 5.12 | Classification of information | Y | Organizational | ISMS; portal handles internal PII with minimization (DAT-06) |
| 5.13 | Labelling of information | Y | Organizational | ISMS |
| 5.14 | Information transfer | Y | Implemented | TLS (DAT-03), least-privilege Graph, single-origin CORS (APP-04) |
| 5.15 | Access control | Y | Implemented | RBAC + per-object gates — IAM-03 / IAM-04 |
| 5.16 | Identity management | Y | Implemented | Entra delegated identity + directory sync — IAM-01 / IAM-02 |
| 5.17 | Authentication information | Y | Partial | No passwords stored (Entra/PKCE); secrets to Key Vault target — SUP-03 |
| 5.18 | Access rights | Y | Implemented | App roles + joiner/mover/leaver via sync (review is ISMS) |
| 5.19 | Supplier relationships | Y | Organizational | ISMS |
| 5.20 | Supplier agreements | Y | Organizational | ISMS |
| 5.21 | ICT supply chain security | Y | Implemented | Lockfiles + `npm ci` + dependency/secret scanning — SUP-01 |
| 5.22 | Monitoring supplier services | Y | Organizational | Microsoft/Azure service monitoring |
| 5.23 | Information security for cloud services | Y | Implemented (+ ISMS) | Least-privilege Graph (`Sites.Selected`), Managed Identity target — DAT-06 / ADR-112 |
| 5.24 | Incident management planning | Y | **Planned** | IR-01 (runbook) |
| 5.25 | Assessment & decision on events | Y | Partial | Audit log (LOG-02) + metrics (LOG-04); formal triage planned — IR-01 |
| 5.26 | Response to incidents | Y | **Planned** | IR-01 / GDPR-04 |
| 5.27 | Learning from incidents | Y | Planned | Post-incident review in IR-01 |
| 5.28 | Collection of evidence | Y | Implemented | Append-only, tamper-evident ledgers — DAT-01 / LOG-02 |
| 5.29 | Information security during disruption | Y | Implemented | Rehearsed DR runbook — OPS-01 |
| 5.30 | ICT readiness for business continuity | Y | Partial | Backups/DR (OPS-01); HA groundwork; PITR pending Azure |
| 5.31 | Legal, statutory, regulatory & contractual | Y | Implemented | GDPR tooling (GDPR-01/02) + ROPA/DPIA/notice drafts (GDPR-03) |
| 5.32 | Intellectual property rights | Y | Organizational | ISMS; OSS lockfiles tracked |
| 5.33 | Protection of records | Y | Implemented | Append-only ledgers enforced by DB grants — DAT-01 |
| 5.34 | Privacy & protection of PII | Y | Implemented | DSAR/erasure/retention (GDPR-01/02) + minimization (DAT-06) |
| 5.35 | Independent review of information security | Y | Organizational | External pen-test/audit recommended (not yet performed) |
| 5.36 | Compliance with policies & standards | Y | Implemented | Controls-as-code CI gate + this SoA — GOV-01 / GOV-02 |
| 5.37 | Documented operating procedures | Y | Implemented | Install / DR / migrations / observability / troubleshooting runbooks |

## A.6 People controls (8)

| # | Control | Appl. | Status | Justification / implementation |
|---|---------|:--:|--------|-------------------------------|
| 6.1 | Screening | Y | Organizational | HR |
| 6.2 | Terms & conditions of employment | Y | Organizational | HR |
| 6.3 | Awareness, education & training | Y | Implemented (supporting tool) | **This system delivers security-policy distribution, acknowledgement and knowledge-check pass** — the primary evidence mechanism for A.6.3 |
| 6.4 | Disciplinary process | Y | Organizational | HR |
| 6.5 | Responsibilities after termination/change | Y | Partial | Directory sync deactivates leavers; process is HR/ISMS |
| 6.6 | Confidentiality / NDAs | Y | Organizational (supported) | Portal can distribute & attest NDAs as policies |
| 6.7 | Remote working | Y | Organizational | Conditional Access (IAM-06) + org policy |
| 6.8 | Information security event reporting | Y | Planned | Reporting channel in IR-01 |

## A.7 Physical controls (14)

All **Applicable** and **Inherited** — the portal has no physical controls of its
own. For the Azure-native target these are inherited from Microsoft's certified
data centres (ISO 27001 / SOC 2); for the interim VM, from the organisation's
facility controls. Covered: 7.1 perimeters, 7.2 entry, 7.3 securing
offices/rooms, 7.4 physical monitoring, 7.5 environmental threats, 7.6 secure
areas, 7.7 clear desk/screen, 7.8 equipment siting, 7.9 off-premises assets,
7.10 storage media, 7.11 supporting utilities, 7.12 cabling, 7.13 equipment
maintenance, 7.14 secure disposal/re-use.

_(Clear-desk/clear-screen 7.7 is additionally supported in-app by the 15-minute
idle logout — IAM-05.)_

## A.8 Technological controls (34)

| # | Control | Appl. | Status | Justification / implementation |
|---|---------|:--:|--------|-------------------------------|
| 8.1 | User endpoint devices | Y | Organizational | Intune / Conditional Access — IAM-06 |
| 8.2 | Privileged access rights | Y | Implemented | Least-privilege DB role (DAT-02) + admin app role (IAM-03) |
| 8.3 | Information access restriction | Y | Implemented | Per-object authorization — IAM-04 |
| 8.4 | Access to source code | Y | Organizational | GitHub repo access + branch protection |
| 8.5 | Secure authentication | Y | Implemented | Entra + PKCE + idle logout — IAM-01 / IAM-05 |
| 8.6 | Capacity management | Y | Implemented | Rate limiting (APP-05) + container resource limits (OPS-03) |
| 8.7 | Protection against malware | Y | Partial | Upload allowlist + server-set Content-Type + nosniff (APP-02); endpoint AV is org |
| 8.8 | Management of technical vulnerabilities | Y | Implemented | npm audit / Trivy / Dependabot — SUP-01 |
| 8.9 | Configuration management | Y | Implemented | Env-injected runtime config (ADR-116); IaC target |
| 8.10 | Information deletion | Y | Implemented | GDPR erasure + retention purge — GDPR-02 |
| 8.11 | Data masking | Y | Partial | Data minimization (DAT-06) + log secret redaction (LOG-01); no field-level masking |
| 8.12 | Data leakage prevention | Y | Partial | Least-privilege + single-origin + minimization; no dedicated DLP |
| 8.13 | Information backup | Y | Implemented | Automated + tested backups — OPS-01 |
| 8.14 | Redundancy of processing facilities | Y | Partial | Stateless-ready app tier + leader election; single-instance today; HA pending Azure |
| 8.15 | Logging | Y | Implemented | Structured logs + append-only audit — LOG-01 / LOG-02 |
| 8.16 | Monitoring activities | Y | Partial | Metrics + health probes (LOG-04); SIEM alerting pending (LOG-03) |
| 8.17 | Clock synchronization | Y | Inherited | Host/container NTP |
| 8.18 | Use of privileged utility programs | Y | Implemented | Least-privilege DB role; gated admin CLIs; no interactive shell in the prod path |
| 8.19 | Installation of software on operational systems | Y | Implemented | Immutable container images; PR + CI — GOV-01 |
| 8.20 | Networks security | Y | Partial | TLS at the edge (DAT-03); DB not publicly exposed (NET-01) |
| 8.21 | Security of network services | Y | Partial | nginx edge; private path planned — NET-02 |
| 8.22 | Segregation of networks | Y | Partial | Loopback-only DB (NET-01); Private Endpoint planned (NET-02) |
| 8.23 | Web filtering | Y | Organizational | Egress filtering is org; app egress is minimal (Graph) with an SSRF guard — APP-07 |
| 8.24 | Use of cryptography | Y | Implemented / Partial | TLS in transit (DAT-03); at-rest (DAT-04) + PG-hop TLS (DAT-05) are operator-enabled |
| 8.25 | Secure development life cycle | Y | Implemented | Gated CI, ADRs, tests, scans — GOV-01 |
| 8.26 | Application security requirements | Y | Implemented | `REQUIREMENTS.md` (NFR-SEC family) |
| 8.27 | Secure system architecture & engineering | Y | Implemented | ADRs + ABB/SBB; token → PDP → immutable-ledger spine |
| 8.28 | Secure coding | Y | Implemented | Parameterized SQL, CSP, headers, error handling — APP-01…06 |
| 8.29 | Security testing in development & acceptance | Y | Implemented | CI unit/integration + coverage + SAST (SUP-02) + smoke e2e |
| 8.30 | Outsourced development | N | **Excluded** | No outsourced development; all code is developed in-house under GOV-01. (Re-mark Applicable if outsourcing is introduced.) |
| 8.31 | Separation of dev, test & production | Y | Implemented | Separate environments/DBs; env-injected config — GOV-01 |
| 8.32 | Change management | Y | Implemented | PR + CI gates + transactional migrations — GOV-01 / OPS-02 |
| 8.33 | Test information | Y | Implemented | Synthetic fixtures only; no production PII used in tests |
| 8.34 | Protection of information systems during audit testing | Y | Organizational | Read-only, scheduled reviews; append-only ledgers protect records during audit |

---

## Summary

| Theme | Controls | Applicable | Excluded |
|-------|:--:|:--:|:--:|
| A.5 Organizational | 37 | 37 | 0 |
| A.6 People | 8 | 8 | 0 |
| A.7 Physical | 14 | 14 | 0 |
| A.8 Technological | 34 | 33 | 1 (8.30) |
| **Total** | **93** | **92** | **1** |

**Exclusions (with justification):** only **A.8.30 Outsourced development** —
there is no outsourced development; all code is produced in-house under change
control (GOV-01). This exclusion is reviewed if the sourcing model changes.

**Status distribution (this system's realized controls):** the technological
controls are predominantly **Implemented**; the residual **Partial/Planned** items
are concentrated in operator/organizational actions (MFA — IAM-06; at-rest
encryption — DAT-04; SIEM alerting — LOG-03; incident/breach runbooks — IR-01 /
GDPR-04) and the Azure network-isolation roadmap (NET-02), consistent with the
Zero Trust roadmap in [`ZERO-TRUST.md`](ZERO-TRUST.md).

_This SoA is a living document; regenerate the control-centric coverage with
`node compliance/report.mjs`. Owner: ISMS / engineering. Review cadence: per
release and at ISMS management review._
