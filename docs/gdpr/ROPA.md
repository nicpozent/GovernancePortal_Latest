# Record of Processing Activities (ROPA) — Governance Portal
**Status: DRAFT for controller review (Art. 30 GDPR).** Pre-filled from the system's
actual behaviour. Fill the `‹…›` fields and have your DPO adopt it. Not legal advice.

## Controller & contacts
- **Controller:** ‹Birgma / Biltema legal entity name + address›
- **DPO / privacy contact:** ‹name, email›
- **This record covers:** the Birgma Governance Portal (policy acknowledgement,
  training, and compliance-evidence system).

## Purpose & lawful basis
- **Purpose of processing:** record and evidence that employees have read and
  acknowledged governance documents (policies, procedures, guidelines) and completed
  required trainings/knowledge checks; produce compliance reporting.
- **Lawful basis (Art. 6):** ‹confirm› primarily **Art. 6(1)(c) legal obligation**
  and/or **Art. 6(1)(f) legitimate interests** (demonstrating regulatory/policy
  compliance). *Consent is deliberately NOT the basis* — acknowledgement is a required
  work activity, not freely-given consent.
- **Special category data (Art. 9):** none processed.

## Categories of data subjects
Employees (and other directory principals) of ‹org› who are assigned to the app in
Entra ID.

## Categories of personal data (as built)
| Category | Fields | Source |
|---|---|---|
| Identity / directory | Entra objectId (oid), UPN, work email, display name, job title, department, status, manager name/email | Microsoft Entra ID (sync) |
| Acknowledgement evidence | signed document + version, typed full name, timestamp, **IP address, user-agent** | Captured at signing |
| Knowledge-check results | quiz score, percentage, pass/fail, attempt count, timestamps | App |
| Notification history | reminder milestone + timestamp | App |
| Admin action trail | actor identity, action, target, IP, timestamp | App (`audit_log`) |

## Recipients
- Internal: ‹Governance admins/managers› (role-scoped; managers see only their team).
- Processors / sub-processors: **Microsoft** (Entra ID, Microsoft Graph, SharePoint,
  and — if used — Azure hosting/Storage/Cache). Covered by the Microsoft DPA under your
  M365/Azure agreement. ‹List any SIEM/log-forwarding recipient if enabled.›

## International transfers
‹State hosting region. If EEA-resident and Microsoft EU Data Boundary applies, note it;
otherwise identify the transfer mechanism (SCCs).›

## Retention
- Compliance records (`signatures`, `quiz_attempts`, `audit_log`, `notifications_sent`)
  retained **‹10› years** (`RETENTION_YEARS`), then purged via the privileged retention
  tool (`docs/GDPR-DATA-RIGHTS.md`). Directory records for leavers are marked inactive
  and retained for the same evidential reason (Art. 17(3)(b)).

## Technical & organisational security measures (Art. 32)
Entra SSO with token validation (tenant/audience/scope pinned); role-based access;
private-by-default documents; append-only ledgers enforced by DB grants; full audit
trail; parameterised SQL + upload allowlist + CSP; TLS in transit at the edge.
**To confirm/enable:** at-rest encryption (BitLocker/CMK) and API→DB TLS (`PGSSL=require`)
— see `SECURITY-REVIEW.md §6b`. Full detail: `docs/SECURITY-REVIEW.md`.

## Data-subject rights mechanisms
Access/portability via DSAR export; rectification upstream in Entra; erasure via the
privileged CLI under the Art. 17 process — all in `docs/GDPR-DATA-RIGHTS.md`.
