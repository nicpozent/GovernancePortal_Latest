# Birgma Governance Portal — Disaster Recovery Runbook

This is the **incident-grade, step-by-step** DR procedure. It supersedes the
command reference in `RESTORE.md` (which it links to for the raw restore commands)
by adding the parts a real recovery needs: what state exists, where the off-host
copies are, a scenario decision tree, and verification + sign-off.

> **Print this or keep it off the portal.** In a real disaster the portal (and this
> file, if only on the lost VM) may be unreachable. Store a copy with the off-host
> backups.

---

## 0. Do we even need High Availability? (read this first)

**Short answer: no — not for this application, not now.** HA (multiple live
replicas, automatic failover, sub-minute downtime) protects against a *process/host
dying mid-request*. For a policy-acknowledgement portal that is the wrong thing to
optimise:

- **Usage is not latency- or uptime-critical.** Employees acknowledge policies and
  complete trainings occasionally. A few hours offline is an inconvenience, not a
  business or compliance failure — the acknowledgement simply happens later.
- **What actually matters is DURABILITY, not availability.** The value of this
  system is the **compliance evidence**: the append-only `signatures`, `audit_log`
  and `quiz_attempts` ledgers. *Losing* that record is the real disaster; being
  briefly *unreachable* is not. So the money goes into backups you can actually
  restore, not into failover.
- **HA is expensive and, on the current VM, throwaway.** Hand-building Postgres
  replication + a load balancer + shared storage on the VM is fragile plumbing
  you'd discard the moment you move to Azure.

**Posture we target instead:**

| Objective | Target | How it's met |
|---|---|---|
| **RPO** (max data loss) | ≤ 24 h; ~0 for planned changes | Daily DB dump + daily uploads mirror; **manual backup before any risky change** |
| **RTO** (time to recover) | ≤ 4 h onto a fresh host | This runbook, rehearsed |
| **Availability** | Single instance; restart-on-failure | `restart: unless-stopped` + host monitoring |

The app tier is already *stateless-ready* (uploads can move to Blob, schedulers use
a leader lock, rate-limit can share Redis) so if the availability requirement ever
rises, the move is a config change on Azure — not a rebuild. Until then, **DR is the
investment that matters.**

---

## 1. What has to be recovered (the state inventory)

Everything else (the app code, images) is rebuildable from git. Only these carry
irreplaceable state:

| # | Asset | Lives in | Backed up by | Notes |
|---|---|---|---|---|
| 1 | **Database** (the compliance ledger) | `pgdata` Docker volume | Daily `pg_dump` → `deploy/backups/governance-*.sql`; full zip's `database.sql` | The core asset. Append-only ledgers. |
| 2 | **Uploaded training files** | `deploy/uploads/` bind mount | `backup-all.ps1 -IncludeUploads` (mirrors them next to the zip) and/or the lighter daily `backup-uploads.ps1` | ⚠️ *Not* in the DB dump. Must be captured or the DB's `upload_path`s become dead links. |
| 3 | **TLS cert + keys** | `deploy/certs/` | *Not* auto-backed-up (secret) | Re-issue or restore from your secret store; app runs without it only on HTTP. |
| 4 | **Runtime config / secrets** | `deploy/.env`, `apps/api/.env` | *Not* in the full zip (secret) | Reproduce from your password manager / Azure Key Vault. `*.env.example` templates ARE in the zip. |

**The #1 DR mistake for this app** is treating "we have DB backups" as "we have
backups." Assets 1 **and** 2 must be captured **together and off-host**, or a
restore produces a portal whose training documents 404.

---

## 2. Before any disaster: the backup baseline (verify this is true today)

**Where backups live today (so you know what to move off-host):**
- The **daily DB dump** is written by the API to `/backups` in the api container,
  which is bind-mounted to **`deploy/backups/`** on the VM host (compose:
  `./backups:/backups`). `BACKUP_RETENTION` keeps the last 14. → on the host, but
  **on the same VM as the data.**
- **`backup-all.ps1`** writes `governance-full-*.zip` to **`C:\governance-backups`**
  by default → also on the same VM unless you pass an off-host `-Dest`.
- **Uploads** sit in `deploy/uploads/` → on the same VM.

So the single change that turns "we have backups" into real DR is **getting a copy
off the VM.** Confirm all four:

1. **DB dumps are being written.** `deploy/backups/` should contain recent
   `governance-*.sql`. Also on demand from the **Backups** screen or `backup-all.ps1`.
2. **A full application backup is going OFF-HOST.** Schedule
   `backup-all.ps1 -Dest \\backup-server\governance` (or a mounted Azure Files path).
   It now writes the zip (code + `database.sql`) **and** mirrors `uploads/` to
   `<Dest>\uploads-mirror` in one run — so a single off-host `-Dest` covers assets
   1 **and** 2. It warns if `-Dest` is a local path.
3. **(Optional, more frequent) uploads-only mirror.** If you want uploads captured
   more often than the full backup, schedule `backup-uploads.ps1 -Dest <off-host>`
   daily (its own Task Scheduler snippet is at the bottom of the script).
4. **Secrets are recorded somewhere safe** (assets 3 & 4): the two `.env` files and
   the TLS cert/key, in a password manager or Key Vault — the zip deliberately omits
   them.

> **Off-host is the whole point.** Backups on the same VM as the data die *with* the
> VM. Point `backup-all.ps1 -Dest` at another machine / share / Azure Files.

---

## 2b. One-time setup: automated off-host backups (plain-language how-to)

This turns the "backup baseline" above from a manual chore into something that runs
by itself, every day, to a safe location. Two steps.

### Step 1 — Choose the off-host destination (the `-Dest`)

`backup-all.ps1` needs to know **where to put the backups**. That location is the
`-Dest` ("destination") value you pass it. **"Off-host" simply means *not on this
same VM.*** Today backups go to `C:\governance-backups`, a folder on the very
machine that runs the app — so if the VM is lost (disk failure, ransomware, VM
deleted), the backups are lost with it. The fix is to send them somewhere else.

Pick one, easiest → most robust:

| Option | Example `-Dest` value | Notes |
|---|---|---|
| A network file share on another server | `\\backup-server\governance` | Simplest if you already have a file server. |
| A second disk / NAS appliance | `\\nas01\backups\governance` or `E:\...` (only if E: is a *separate* physical device) | A second disk survives an OS-drive failure, not a whole-VM loss. |
| **Azure Files** (cloud file share), mounted as a drive | `\\<account>.file.core.windows.net\governance` | Good stepping stone — it's off-site and aligns with the future Azure move. |

Whatever you choose, test that you can write to it from the VM first:

```powershell
"test" | Out-File \\backup-server\governance\_writetest.txt   # then delete it
```

> This is the one decision only you/IT can make — it depends on what storage your
> environment actually has. Record the chosen path here: `_______________________`

### Step 2 — Make it run automatically every day (Windows Task Scheduler)

Right now the backup only runs when someone runs it by hand — and people forget.
**Task Scheduler** is the built-in Windows "run this on a schedule" tool (like `cron`
on Linux). Run the block below **once**, in an **Administrator** PowerShell, with
your real `-Dest` and install path filled in. After that Windows runs the backup
itself — nobody has to remember.

```powershell
# EDIT these two values to match your environment:
$script = "C:\Governance\deploy\scripts\backup-all.ps1"   # where the script lives
$dest   = "\\backup-server\governance"                            # your off-host destination (Step 1)

$action  = New-ScheduledTaskAction -Execute "powershell.exe" `
             -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`" -Dest `"$dest`""
$trigger = New-ScheduledTaskTrigger -Daily -At 2am               # every day at 02:00
Register-ScheduledTask -TaskName "Governance Full Backup" `
             -Action $action -Trigger $trigger -RunLevel Highest
```

In English: *"Every day at 2 AM, run the backup script and send the output to the
off-host destination."* Because `backup-all.ps1 -IncludeUploads` is on by default,
this one scheduled job backs up **both the database and the uploaded training
files** off-host in a single run.

**Verify the schedule works:**
```powershell
Start-ScheduledTask -TaskName "Governance Full Backup"   # run it now, don't wait for 2am
Get-ScheduledTaskInfo -TaskName "Governance Full Backup" # check LastTaskResult = 0 (success)
```
Then confirm a fresh `governance-full-*.zip` **and** an `uploads-mirror\` folder
appeared at your `-Dest`.

> If you want the uploaded files captured *more often* than the daily full backup,
> also schedule `backup-uploads.ps1 -Dest <off-host>` (same pattern; its snippet is
> at the bottom of that script). Otherwise the daily full backup already covers them.

---

## 3. Which scenario am I in? (decision tree)

```
Is the HOST (VM) still alive and Docker running?
│
├─ YES ── Is it just the DATA that's bad (wiped/corrupted/wrong)?
│         ├─ YES → SCENARIO A: restore the database in place            (§4)
│         └─ NO, a training file is missing/corrupt only → SCENARIO B   (§5)
│
└─ NO  ── Host lost / ransomware / total failure → SCENARIO C: rebuild  (§6)
```

---

## 4. SCENARIO A — Restore the database in place (most common)

Host is fine; data was corrupted, wiped, or a bad bulk change needs rolling back.

```powershell
cd C:\Governance\deploy      # the folder containing docker-compose.yml

# 1. SAFETY NET — dump the current (bad) state first so you can back out.
docker compose exec -T db pg_dump -U postgres -d governance --no-owner --clean --if-exists `
  | Out-File -Encoding utf8 .\backups\pre-restore-$(Get-Date -Format yyyyMMdd-HHmmss).sql

# 2. Pick the dump to restore (newest good one) and load it. --clean drops &
#    recreates objects first, so no manual cleanup is needed.
Get-Content .\backups\governance-2026-07-04T02-00-00.sql `
  | docker compose exec -T db psql -U postgres -d governance

# 3. Restart the API so it reconnects cleanly.
docker compose restart api
```

Then **§7 Verify**. (This is `RESTORE.md` section A with the safety dump made
mandatory.)

---

## 5. SCENARIO B — A training file is missing/corrupt (data intact)

The DB is fine but a specific uploaded document won't open (the serve route returns
`missing_file`). Restore just that file from the uploads mirror.

```powershell
# Find the storage key: the portal shows the doc; or query it.
docker compose exec -T db psql -U postgres -d governance `
  -c "select id, name, upload_path from policies where source='Upload' order by updated_at desc limit 20;"

# Copy the file back from the off-host uploads mirror into the live volume.
Copy-Item "\\backup-server\governance\uploads\<upload_path>" ".\uploads\<upload_path>" -Force
```

No restart needed — the file is served straight from disk. Verify by opening the
document in the portal.

---

## 6. SCENARIO C — Rebuild on a fresh host (full disaster recovery)

The VM is lost/ransomed. Rebuild from off-host backups. **Target RTO ≤ 4 h.**

**Prerequisites on the new host:** Windows + Docker Desktop/WSL2 (see
`INSTALL-GUIDE.md`), and access to your off-host backups + secret store.

```powershell
# 1. Restore the deployment folder.
#    Unzip the latest governance-full-*.zip to e.g. C:\Governance-restore. Its layout:
#      C:\Governance-restore\database.sql   ← the DB dump
#      C:\Governance-restore\app\           ← the project (compose is in app\deploy)
#    Then restore the SECRETS the zip omits (from your password manager / Key Vault):
#      - app\deploy\.env  and  app\apps\api\.env   (from the *.env.example templates)
#      - app\deploy\certs\  (TLS fullchain.pem + privkey.pem), or re-issue the cert
cd C:\Governance-restore\app\deploy

# 2. Bring up ONLY the database first. A fresh pgdata volume auto-runs the schema
#    + all migrations from docker-entrypoint-initdb.d.
docker compose up -d db
Start-Sleep -Seconds 25        # wait for healthy + init to finish
docker compose exec db pg_isready -U postgres -d governance   # expect: accepting connections

# 3. Load the data dump (at the unzip root, two levels up) over the fresh schema
#    (--clean makes it idempotent).
Get-Content ..\..\database.sql | docker compose exec -T db psql -U postgres -d governance
#    (If you only have a standalone governance-*.sql, use that path instead.)

# 4. ⚠️ RESTORE THE UPLOADS — the step the old procedure missed. Copy the uploads
#    mirror back into the bind mount BEFORE serving traffic, or every training
#    document 404s.
robocopy "\\backup-server\governance\uploads" ".\uploads" /E /Z /R:2 /W:5

# 5. Bring up the rest of the stack.
docker compose up -d --build
```

Then **§7 Verify**, then repoint DNS/Front Door to the new host.

> **Data-loss window (RPO):** the restore is as fresh as your newest DB dump AND
> uploads mirror. Restore matching-day copies of both so the ledger and the files
> agree.

---

## 7. Verify the restore (ALWAYS — a restore isn't done until verified)

```powershell
# Row counts — compare against what you expect from the source day.
docker compose exec db psql -U postgres -d governance -c `
 "select (select count(*) from employees) employees, (select count(*) from policies) policies, (select count(*) from signatures) signatures, (select count(*) from audit_log) audit, (select count(*) from quizzes) quizzes;"

# API is healthy.
curl.exe -k https://localhost/healthz        # {"ok":true}
```

Then sign in and confirm, in order:
1. Policies/trainings list appears.
2. **Open an uploaded training document** — it downloads (proves asset 2 recovered).
3. A known employee's **signature history** is intact (proves the ledger recovered).
4. Admin dashboard percentages look right.

Only after all four: announce recovery and re-enable user access.

---

## 8. Rehearsal — do this ONCE now, not during an incident

A backup you've never restored is a guess. Rehearse Scenario A + C on a throwaway
copy and **record RTO**:

1. On a non-prod copy (or a temp DB name), run §4 with a recent dump.
2. Run §6 steps 2–4 against a scratch `uploads` folder from the mirror.
3. Run §7; confirm counts match and an uploaded doc opens.
4. Time it end-to-end — that number is your real **RTO**.

| Date rehearsed | By | Scenario(s) | Measured RTO | Notes |
|---|---|---|---|---|
| 2026-07-05 | Mechanism verification | A + C (DB) + uploads | <1s on 2-row set | Real schema + all 18 migrations + grants applied to a scratch DB; seeded ledger; `pg_dump --clean --if-exists`; dropped the whole schema (total loss); restored from the dump + restored the uploads mirror. Post-restore counts matched exactly, uploaded files byte-identical, and the append-only grants survived (`governance_app` still cannot DELETE `signatures`). **Re-run on a production-sized dataset to get a real RTO number.** |

---

## 9. When you move to Azure (future — removes most of this runbook)

The Azure-native target collapses most DR work into managed services:
- **Azure Database for PostgreSQL Flexible Server** → automated backups + **PITR**
  (restore to any second in the retention window) + optional zone-redundant HA.
  Replaces §4/§6 DB steps entirely.
- **Azure Blob** (`STORAGE_DRIVER=blob`, already built) with soft-delete + versioning
  → uploads are durable and versioned; replaces §2/§5 and the uploads mirror.
- **Container Apps / App Service** → images redeploy from CI; "rebuild the host"
  becomes "redeploy," and multi-replica + HA edge come essentially for free *if* the
  availability requirement ever rises.

At that point RPO drops to minutes (PITR) and RTO to a redeploy, and the only DR
doc you keep is "how to trigger a PITR restore + point the app at it."
