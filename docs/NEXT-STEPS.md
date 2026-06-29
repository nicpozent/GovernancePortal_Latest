# Birgma Governance Portal — Next Steps & Backlog

Work intentionally deferred, prioritized. Two streams: **Security & Governance**
(hardening) and **Functional backlog** (features not yet built).

---

## A. Security & Governance hardening

### A1. Internalize the database (quick win)
Remove the `5432:5432` mapping in `docker-compose.yml`. The API reaches Postgres on
the internal Docker network (`db:5432`) without it, so nothing breaks; the DB simply
stops being reachable from the VM's network. Direct access then via
`docker compose exec db psql …` or an SSH tunnel.

### A2. Secrets management
- **On-prem:** restrict NTFS permissions on `.env` and `certs/`; enable **BitLocker**
  on the VM disk; rotate the Graph client secret on a schedule.
- **Azure-native (preferred):** **Managed Identity** (the code uses
  `DefaultAzureCredential` when `GRAPH_CLIENT_ID`/`AZURE_CLIENT_SECRET` are blank — so
  **no secret stored at all**) + **Azure Key Vault** for the DB connection string.

### A3. Network & data protection (Azure-native)
- **Azure Database for PostgreSQL** behind a **Private Endpoint**, TLS enforced (`PGSSL=require`).
- Front the app with **Front Door / Application Gateway (WAF)**.
- **Conditional Access**: require MFA / compliant device for both app registrations (policy-side, no code).

### A4. Front-end supply chain
Vendor React / MSAL / Babel **locally** (drop the CDN `<script>` tags) so the app has
no third-party origin dependency; then tighten the **CSP** (remove `unsafe-eval`,
restrict `script-src` to `'self'`).

### A5. Finer-grained roles
Today authorization is admin-or-not. Introduce a **Compliance** role (the platform
group already exists) that can manage policies/quizzes and view reports, but not
groups, backups, or membership. Map app roles → permissions server-side.

### A6. Operational governance
- **Tested restore drill** (see B2) and documented RPO/RTO.
- **Log retention/rotation** + alerting on API/sync/reminder failures.
- Periodic **access review** of who holds `Governance.Admin`.

### A7. GDPR organisational artefacts (controller actions)
The app provides the technical measures (Art. 25/32); these are the documented
controller obligations Birgma must complete:
- **Lawful basis (Art. 6)** — record it (legal obligation / legitimate interest for workplace compliance).
- **Records of Processing (Art. 30)** — add this system to the RoPA (data, purpose, retention, recipients).
- **DSAR process (Art. 15)** — documented procedure for access/rectification requests (data already viewable in “My signatures” / admin export; consider the one-click per-employee export in B1).
- **Breach notification (Art. 33)** — detection→ 72-hour notification runbook (depends on the monitoring/alerting in A6).
- **At-rest encryption (Art. 32)** — BitLocker / Azure CMK (also A2/A3).
- _Note:_ privacy-notice wording (IP + timestamp), the 10-year retention policy, the Art. 17 erasure exemption for leavers, and the Microsoft sub-processor/DPA point are now surfaced in the in-app **Help** section (admin + employee topics).

---

## B. Functional backlog (not yet built)

### B1. Per-employee evidence export (high — auditor-facing)
One-click **PDF "certificate of acknowledgement"** per signature (employee, policy,
version, timestamp, quiz score) for audit evidence. The bulk CSV already exists; this
is the per-record artifact auditors usually request.

### B2. Tested backup/restore procedure (high — risk)
A `RESTORE.md` + a rehearsed restore: `docker compose down`, fresh volume,
`psql < backup.sql`, verify. A backup never restored isn't a backup.

### B3. Leavers / movers handling (high — audit correctness)
Define explicitly what happens when sync marks an employee inactive or moves them
between departments/groups: open requirements drop out of "required" (already the
behaviour via `status='Active'`), but **historical signatures must be retained** and a
"former employees" view should surface them. Confirm + add the view.

### B4. Policy review dates (medium)
Use the existing unused `effective_date`; add a **"review by"** date and remind the
**owner** when a policy is going stale, so content stays current.

### B5. Quiz answer review & analytics (medium)
After a failed attempt, show **which questions were wrong**; give admins
**per-question analytics** (pass rates) to spot confusing policies/questions.

### B6. Policy version history (medium)
Persist a visible **change log** of version bumps over time (currently only the
*current* version is tracked), for audit and "what changed when".

### B7. Bulk operations (medium)
Assign one policy to many groups at once, or apply a deadline/quiz to several policies
together — faster admin at scale.

### B8. UX, accessibility & localization (ongoing)
- **First-run empty-state guidance** ("sync → map groups → assign → quiz").
- **Accessibility pass** (keyboard nav, screen-reader labels, contrast).
- **Localization** (e.g. Swedish / multi-language for Birgma/Biltema).
- **Mobile-friendly** layout so employees can acknowledge from a phone.

### B9. Notification depth (low — builds on email reminders, now shipped)
- **Manager escalation**: copy the functional manager on overdue items.
- **Digest** option (one weekly summary instead of per-policy mails).
- In-app notification center.

---

## Suggested order
1. A1 (internalize DB) — minutes.
2. B2 (tested restore) + B3 (leavers/movers) — risk/audit correctness.
3. B1 (evidence PDF export) — auditor value.
4. A2/A3 (secrets + network) when moving toward the Azure-native model.
5. B4–B7 incrementally; A4/A5 and B8 as polish.

_Already shipped recently: email reminders (assignment + 20/15/7/1-day + overdue,
idempotent), nightly auto directory sync, and in-app searchable Help._
