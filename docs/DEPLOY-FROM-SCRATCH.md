# DEPLOY FROM SCRATCH — Birgma Governance Portal

A clean install on a fresh machine. Because the database starts empty,
**every schema migration and grant runs automatically** — no manual SQL.

## Prerequisites (on the VM)
- Docker Desktop (Linux containers, WSL2 backend) running.
- This `governance-deploy` folder copied to the VM, e.g. `C:\governance-deploy`.

## 1. Configuration
```powershell
cd C:\governance-deploy
copy .env.example .env                                  # set POSTGRES_PASSWORD, APP_DB_PASSWORD, and the Entra IDs
copy birgma-governance\.env.example birgma-governance\.env   # Graph client id + secret, SharePoint site id
mkdir backups                                           # for scheduled DB backups
mkdir certs                                             # TLS cert + key (see TLS-AND-PERMISSIONS.md)
```
Put `fullchain.pem` + `privkey.pem` in `certs\` (or generate a self-signed pair for testing — see TLS-AND-PERMISSIONS.md).

## 2. Build & start
```powershell
docker compose up --build -d
```
On first boot the **db** container runs, in order:
1. `01-role`      — creates the `governance_app` login
2. `02-schema`    — base tables (employees, policies, signatures, sync_runs)
3. `03-groups`..`0499-quizarchive` — every migration (groups, platform mapping,
   archive, audit log, managers, due dates, quizzes, quiz archive, …)
4. `05-grants`    — least-privilege grants + append-only locks (runs LAST)

No manual `ALTER`/`GRANT` needed — that's only required when upgrading an
*existing* database (init scripts run once, on an empty volume only).

## 3. Verify
```powershell
docker compose ps                       # db, api, web healthy
curl.exe -k https://localhost/healthz   # {"ok":true}
docker compose exec api grep -c eff_members src/routes.js   # > 0 = new code
```

## 4. Entra / SharePoint (one-time, in Azure)
See `TLS-AND-PERMISSIONS.md` and `birgma-governance/IMPLEMENTATION_GUIDE.md`:
- SPA app registration redirect URI = your https origin.
- API app: `accessTokenAcceptedVersion: 2`, expose `access_as_user`.
- Graph application permissions + admin consent; `Sites.Selected` read on the site.
- Put `GRAPH_CLIENT_ID` + a fresh `AZURE_CLIENT_SECRET` in `birgma-governance/.env`.

## 5. First use
- Sign in (Entra) → **Employees → Sync now** to import users/groups.
- Map directory groups into platform groups (or add members), assign policies,
  build quizzes, set deadlines.

## What's included (all migrations 002–012)
groups & many-to-many membership · platform groups + AD/Entra mapping ·
policy archive · admin audit log · functional + legal manager fields ·
absolute & rolling signature deadlines · quizzes (points, pass mark,
3-attempt limit, gated signing) · quiz archive/restore · least-privilege
role with append-only signature/audit/quiz-attempt ledgers.

## Upgrading an EXISTING database instead
Init scripts do NOT re-run on a populated volume. Apply only the new
migration(s) by hand, e.g.:
```powershell
docker compose exec db psql -U postgres -d governance -f /docker-entrypoint-initdb.d/0499-quizarchive.sql
```
(or paste the SQL with `-c`). The files live in `birgma-governance/db/`.

## Production hardening (see notes)
- Remove the `5432:5432` port mapping (DB stays on the internal Docker network).
- Protect `.env` (DB superuser password + TLS key) and limit VM/Docker access.
- Keep `certs/` and backups access-controlled; store full backups off-host.
