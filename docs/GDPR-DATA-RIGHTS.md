# Birgma Governance Portal — GDPR Data-Subject Rights & Retention Runbook

How to handle access, rectification, erasure, and retention for the personal data
this system holds. It documents the **tools that now exist in the code** and the
**process** around them. For the data inventory and lawful basis, see
`docs/gdpr/ROPA.md`; for the notice shown to staff, `docs/gdpr/PRIVACY-NOTICE.md`.

> **Design principle:** the running application can *read* personal data and export
> it, but **cannot delete** the append-only ledgers (`signatures`, `audit_log`,
> `quiz_attempts`) — the app role is `REVOKE`d from DELETE. Erasure and retention
> purges are therefore performed by a **DBA** using a privileged connection
> (`ADMIN_DATABASE_URL`), never exposed through the web app. This keeps the
> compliance record tamper-resistant while still making lawful erasure possible.

---

## What personal data we hold (summary)

| Table | Personal data | Notes |
|---|---|---|
| `employees` | oid, UPN, email, name, job title, department, manager, status | Sourced from Entra (directory) |
| `signatures` | user_oid, typed full name, version, timestamp, **IP, user-agent** | The acknowledgement evidence |
| `quiz_attempts` | user_oid, score/percentage/pass, timestamp | Knowledge-check results |
| `notifications_sent` | user_oid, milestone, timestamp | Reminder history |
| `audit_log` | actor_oid, actor_name, action, IP, timestamp | Admin/manager action trail |

Full field-level inventory: `docs/gdpr/ROPA.md`.

---

## 1. Right of access & portability (Art. 15 / 20)

**Self-service:** any employee sees their own acknowledgements on the *My signatures*
page.

**Full DSAR export (admin):** produces a complete, machine-readable (JSON) package of
everything held about one subject.

- **Via the API** (admin only, and the export is itself audited):
  ```
  GET /api/admin/data-subject/<oid>/export
  ```
  Returns `{ employee, groupMemberships, signatures, quizAttempts, notifications, auditActions, counts }`.
- **Via the CLI** (no UI needed):
  ```bash
  cd apps/api
  ADMIN_DATABASE_URL=postgres://postgres:***@db:5432/governance \
    npm run gdpr -- export --oid <oid> > dsar-<oid>.json
  ```

**Process:** verify the requester's identity → run the export → deliver securely →
record it in the DSAR register (below). Target: within 1 month (Art. 12(3)).

## 2. Rectification (Art. 16)

Directory fields (name, email, title, department, manager) are mastered in **Entra ID**
and overwritten on each sync — correct them **upstream in Entra**, then run a sync
(Admin → Sync, or `npm run gdpr` is not involved here). The typed `full_name` on a
past signature is immutable by design (it's evidence of what was signed); do not alter it.

## 3. Erasure (Art. 17)

**Default position:** compliance records are retained under the **Art. 17(3)(b)
exemption** (processing necessary for a legal obligation / establishment of legal
claims). Leavers are kept, not deleted. Document this in your response to any erasure
request.

**When erasure IS legally required** (the exemption does not apply, or retention has
lapsed for that subject), a DBA performs it:

```bash
cd apps/api
# 1. DRY-RUN first — shows exactly what will be removed, changes nothing:
ADMIN_DATABASE_URL=postgres://postgres:***@db:5432/governance \
  npm run gdpr -- erase --oid <oid>
# 2. Apply:
ADMIN_DATABASE_URL=... npm run gdpr -- erase --oid <oid> --apply
```

What it does (in one transaction): deletes the subject's `signatures`, `quiz_attempts`,
`notifications_sent`, and `employee_groups`; deletes the `employees` row; detaches FKs
(nulls `functional_manager_oid`, `policies.owner_oid`); and **pseudonymises** the
subject's `audit_log` entries (`actor_oid→null`, `actor_name→'[erased]'`) so the
*record that an action happened* survives without the identity. Record it in the
erasure register.

## 4. Retention purge

Retention period is `RETENTION_YEARS` (default **10**, `apps/api/src/config.js`) — keep
it in step with the number in the privacy notice. Deletion is **not automatic**; a DBA
runs the purge periodically (e.g. annually):

```bash
cd apps/api
# DRY-RUN — counts records older than the retention period:
ADMIN_DATABASE_URL=... npm run gdpr -- retention
# Apply (optionally override the period):
ADMIN_DATABASE_URL=... npm run gdpr -- retention --years 10 --apply
```

Purges `signatures`, `quiz_attempts`, `notifications_sent`, and `audit_log` rows older
than the cutoff, in one transaction. Run a fresh backup first (DR runbook §2).

## 5. Breach notification (Art. 33/34)

Detection is via the log/alert pipeline (`docs/OBSERVABILITY.md` — auth-failure spikes,
5xx, feed abuse). On a suspected personal-data breach: contain → assess scope using the
`audit_log` and access logs → if risk to individuals, notify the supervisory authority
within **72 hours** and affected subjects without undue delay. Assign an owner now, not
during the incident.

---

## Registers (fill in as you act)

**DSAR / access requests**

| Date | Subject (oid) | Requested by (verified) | Action | Delivered | By |
|---|---|---|---|---|---|
|  |  |  | export |  |  |

**Erasure actions**

| Date | Subject (oid) | Legal justification | Dry-run reviewed | Applied | By |
|---|---|---|---|---|---|
|  |  |  |  |  |  |

**Retention purges**

| Date | Cutoff (years) | Rows removed (by table) | Backup taken first | By |
|---|---|---|---|---|
|  |  |  |  |  |

---

_This runbook documents technical capability and process. The lawful-basis and
erasure-vs-retention *decisions* are the controller's (DPO) call — see `docs/gdpr/`._
