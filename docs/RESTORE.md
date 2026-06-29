# Birgma Governance Portal — Backup Restore Procedure

A backup you have never restored is a guess, not a safety net. This document is the
**tested** recovery path. Rehearse it once on a throwaway copy so the steps are proven.

---

## What you have to restore from
- **Database dumps** — `./backups/governance-*.sql` (daily auto + manual "Create server
  backup"), or a dump downloaded via the Backups screen / `admin/backup`.
- **Full-application zips** — `governance-full-*.zip` from `backup-all.ps1` (code +
  certs + config + a `database.sql`).

A database dump is produced with `pg_dump --clean --if-exists`, so restoring it **drops
and recreates** the governance objects before loading data — no manual cleanup needed.

---

## A. Restore the DATABASE only (most common)
Use when data was corrupted/wiped but the containers are fine.

```powershell
cd C:\governance-deploy

# 1. (safety) take a fresh dump of the current state first, in case you need to back out
docker compose exec db pg_dump -U postgres -d governance --no-owner --clean --if-exists `
  | Out-File -Encoding utf8 .\backups\pre-restore-$(Get-Date -Format yyyyMMdd-HHmmss).sql

# 2. restore the chosen dump INTO the running db container
Get-Content .\backups\governance-2026-06-24T02-00-00.sql `
  | docker compose exec -T db psql -U postgres -d governance

# 3. restart the API so it reconnects cleanly
docker compose restart api

# 4. verify (see "Verify" below)
```

> The `-T` on step 2 is required (no TTY) when piping a file into `docker compose exec`.

---

## B. Restore onto a FRESH machine (disaster recovery)
Use when the VM/host is lost. Assumes Docker + WSL2 are installed (see INSTALL-GUIDE.md).

```powershell
# 1. unzip a governance-full-*.zip to C:\governance-deploy
#    (contains: app files, certs\, .env files, and database.sql)
cd C:\governance-deploy

# 2. bring up ONLY the database first (fresh empty volume runs migrations automatically)
docker compose up -d db
Start-Sleep -Seconds 20         # let the db become healthy + run init migrations

# 3. load the data from the zip's dump (overwrites the empty schema cleanly)
Get-Content .\app\database.sql | docker compose exec -T db psql -U postgres -d governance

# 4. bring up the rest
docker compose up -d --build
```

If you only have a bare `.sql` (no zip), re-deploy the code from the
`governance-deploy` package first, then follow steps 2–4.

---

## C. Verify the restore (always do this)
```powershell
# row counts should match what you expect
docker compose exec db psql -U postgres -d governance -c "select (select count(*) from employees) employees, (select count(*) from policies) policies, (select count(*) from signatures) signatures, (select count(*) from quizzes) quizzes;"

# api is healthy
curl.exe -k https://localhost/healthz       # {"ok":true}
```
Then sign in to the portal and confirm: policies appear, a known employee's signature
history is intact, and the dashboard percentages look right.

---

## D. Rehearsal checklist (do this ONCE now, not during an incident)
1. Copy a recent `governance-*.sql` to a scratch folder.
2. On a **non-production** copy of the stack (or a temporary DB name), run section A.
3. Run section C and confirm counts match the source.
4. Note how long it took — that is your real **RTO** (recovery time objective).
5. Record the date of the last successful rehearsal here:

   - Last restore rehearsal: ____________________  by: ____________

---

## Notes
- **RPO** (how much data you can lose) = time since the last backup. The daily auto
  job means up to ~24h; run a manual "Create server backup" before risky changes.
- Keep at least one backup **off the host** (the full zip contains secrets — store it
  access-controlled).
- After restoring an older dump, any schema migrations newer than that dump are already
  present on a fresh volume; on an existing volume re-run the one-time `ALTER`/`CREATE`
  statements from the feature you're missing (see DATABASE-MIGRATIONS reference).
