# Security & Compliance Frameworks — mapping and coverage

How the portal's controls map to the frameworks that apply to it, and how that
mapping is kept **deterministic** (computed, not hand-maintained). This replaces
prose gap-analysis with a machine-readable catalogue.

## The model: controls-as-code

- **`compliance/controls.json`** — the single source of truth. Each control records
  its status, the frameworks it satisfies (ISO 27001 / NIST CSF / GDPR / Zero Trust
  pillars), the **MITRE ATT&CK** techniques it mitigates, the risks it reduces, and
  the **evidence** (code path / test / doc) that implements it.
- **`compliance/report.mjs`** — computes coverage, gaps, the MITRE technique set, and
  a Statement of Applicability from the catalogue. Deterministic and dependency-free.
- **`compliance/COVERAGE.md`** — the generated snapshot (regenerate with
  `node compliance/report.mjs --md > compliance/COVERAGE.md`).
- **CI gate** — `node compliance/report.mjs --check` validates the catalogue
  (schema, no dangling framework/risk refs, **evidence files must exist**) and fails
  if `COVERAGE.md` is stale. So the mapping can't silently drift from the code.

```bash
node compliance/report.mjs            # coverage + gaps summary
node compliance/report.mjs --md       # render COVERAGE.md
node compliance/report.mjs --check    # validate + freshness gate (CI)
```

## Applicability (read this first)

| Framework | Applies? | Why |
|---|---|---|
| **ISO/IEC 27001:2022** | ✅ | Information-security controls for the app + platform. |
| **GDPR** | ✅ | Processes employee personal data (identity, acknowledgements, IP/UA). |
| **Zero Trust (NIST 800-207)** | ✅ | Architecture principle — per-request verification, least privilege. |
| **MITRE ATT&CK** | ✅ | Threat model — techniques mapped to mitigations/detections. |
| **NIST CSF 2.0** | ✅ | Function-level (Identify/Protect/Detect/Respond/Recover) framing. |
| **ISO/IEC 42001** | ❌ **N/A** | **No AI/ML processing** in the system (no models, inference, or AI deps; quiz grading is deterministic rule-based scoring). |
| **EU AI Act** | ❌ **N/A** | No AI system in scope → no risk-tier obligations. |
| **NIST AI RMF** | ❌ **N/A** | No AI system in scope. |

**On the AI frameworks:** they are documented as *not applicable* deliberately —
auditors ask, and a recorded "no AI processing" determination is itself evidence.
**Re-assess in two cases:** (a) an AI feature is added to the portal (then they apply
to the app), or (b) the portal is used to *govern other AI systems* as a GRC tool
(a different build — the app would track AI-Act/42001 obligations for those systems,
not become an AI system itself). Neither is true today.

## Current coverage (summary)

See **[`compliance/COVERAGE.md`](../compliance/COVERAGE.md)** for the full, generated
Statement of Applicability. At the time of writing: **39 controls**, **19 MITRE
ATT&CK techniques** mitigated, and these open items:

- **Planned (not built):** breach-notification runbook (`GDPR-04`), Azure private
  endpoint (`NET-02`), security incident-response runbook (`IR-01`), explicit Zero
  Trust pillar mapping (`ZT-01`).
- **Partial (residual gap):** DNS-rebinding on the SSRF guard (`APP-07`), DB-hop TLS
  off by default (`DAT-05`), SIEM wiring (`LOG-03`), non-blocking SAST (`SUP-02`),
  dev secret vs Key Vault (`SUP-03`), published DB port (`NET-01`).
- **Organizational (owner action):** MFA/Conditional Access (`IAM-06`), at-rest
  encryption (`DAT-04`), adopt ROPA/DPIA/notice (`GDPR-03`).

## Zero Trust posture (NIST 800-207 pillars)

| Pillar | Status | Controls |
|---|---|---|
| Identity | Strong | IAM-01/02/03/05 (per-request token validation, app-only rejection, RBAC) |
| Application | Strong | IAM-04, APP-01…04 (per-object authz, injection/CSP/CORS) |
| Data | Strong | DAT-01/02/06 (append-only, least privilege, minimization) |
| Network | Partial | NET-01 (drop the published DB port), NET-02 (private endpoint — planned) |
| Device | Gap (org) | IAM-06 (Conditional Access / device compliance) — Entra-side |
| Visibility | Partial | LOG-01…04 present; SIEM wiring (LOG-03) pending |

A dedicated `ZT-01` control tracks writing the full pillar narrative.

## Companion framework artefacts

- [`ZERO-TRUST.md`](ZERO-TRUST.md) — Zero Trust posture mapped to the NIST SP 800-207 / CISA ZTMM pillars (realizes control `ZT-01`).
- [`ISO27001-SOA.md`](ISO27001-SOA.md) — ISO/IEC 27001:2022 Statement of Applicability, all 93 Annex A controls (realizes control `GOV-02`).

Both are grounded in this catalogue's control IDs and regenerate alongside it.

## Relationship to the risk register

This catalogue is intentionally **portable JSON** so it can feed an external system
of record (e.g. a dedicated risk-register app): each control already carries its
framework refs, ATT&CK techniques, risk ids, and evidence. Integration options when
that becomes the source of truth: export `controls.json` on a schedule, or have the
register import it and overlay likelihood/impact scoring (which this catalogue
deliberately does not own — it maps controls→coverage, not quantitative risk scores).
