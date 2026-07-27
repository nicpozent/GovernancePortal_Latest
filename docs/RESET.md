# Birgma Governance Portal — Reset to a Clean State

Wipes all **data** (policies, employees, signatures, quizzes, mappings, notifications,
audit + sync history) and every group **except the four platform roles**
(Administrators, Compliance, Read All, All Employees), then clears stored backups.

The **schema is kept** — every migration stays applied, so you do NOT re-run
migrations or rebuild afterwards. This is destructive and irreversible.

---

## Option A — PowerShell (recommended)
Run `reset.ps1` (in this folder), or paste these commands:

```powershell
cd C:\Governance\deploy

# 0. (STRONGLY RECOMMENDED) back up first
docker compose exec db pg_dump -U postgres -d governance --no-owner --clean --if-exists `
  | Out-File -Encoding utf8 .\backups\pre-reset-$(Get-Date -Format yyyyMMdd-HHmmss).sql

# 1. wipe transactional data (keeps the four platform roles)
docker compose exec db psql -U postgres -d governance -c "truncate signatures, quiz_attempts, quiz_questions, quizzes, policy_versions, policy_groups, policy_roles, policies, notifications_sent, employee_groups, group_mappings, employees, audit_log, sync_runs restart identity cascade; delete from groups where name not in ('Administrators','Compliance','Read All','All Employees');"

# 2. clear stored backups (optional — comment out to keep them)
Remove-Item .\backups\*.sql -ErrorAction SilentlyContinue

# 3. restart so the API reconnects cleanly
docker compose restart api
```

After this: **Employees → Sync now** to re-import from the directory and start fresh.

---

## Option B — full teardown (also drops the schema)
Use this only if you want a TRULY empty database that re-runs every migration from
scratch on next start (e.g. to test a clean install).

```powershell
cd C:\Governance\deploy
docker compose down -v          # -v DELETES the database volume (all data + schema)
docker compose up --build -d    # fresh volume → every migration + grant runs automatically
```

> `down -v` is the nuclear option: there is no recovery without a backup.

---

## What is kept vs removed

| Kept                                   | Removed                                            |
|----------------------------------------|----------------------------------------------------|
| Database schema + all migrations       | All policies, versions, assignments                |
| Platform roles (the 4 groups)          | All employees + group memberships                  |
| Containers, certs, `.env`, config      | All signatures (acknowledgement ledger)            |
|                                        | All quizzes, questions, attempts                   |
|                                        | Directory group mappings, local/imported groups    |
|                                        | Notifications, audit log, sync history             |
|                                        | Stored `.sql` backups (Option A step 2)            |
