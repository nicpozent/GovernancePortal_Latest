# Birgma Governance Portal — Troubleshooting

Real errors seen during deployment and how to resolve them. Always start by
reading the logs:
```powershell
cd <your-deploy-folder>
docker compose ps
docker compose logs --tail=40 api
docker compose logs --tail=40 db
```

## Fastest first step: automated diagnostics
Before reading logs by hand, run the diagnostics — they localise a problem to a
subsystem (config / db / identity / api / graph / integration / backups / web)
with a remediation hint for each finding, and exit non-zero on failure:
```powershell
docker compose exec api npm run diagnose                                 # check everything
docker compose exec api node tools/diagnostics/diagnose.js db identity   # a subset
docker compose exec api node tools/diagnostics/diagnose.js --json        # for a ticket
```
See `apps/api/tools/diagnostics/README.md`. The sections below explain individual
errors in more depth.

---

## Startup / containers

### `Bind for 0.0.0.0:5432 failed: port is already allocated`
Another stack still holds the port (usually the old folder).
```powershell
docker compose down            # in the OTHER deploy folder
docker ps                      # find any leftover container
docker stop <id>
```
Then `docker compose up -d` again.

### `dependency failed to start: container ...-db-1 is unhealthy`
On a **fresh** volume the DB needs time to run all migrations; the healthcheck
may time out on the first try. Check it actually recovered:
```powershell
docker compose ps              # db often shows "healthy" a few seconds later
docker compose up -d           # bring api + web up against the now-healthy db
```
If it stays unhealthy, a migration errored during init — see
`docker compose logs db | findstr ERROR` and the init-ordering note below.

### `cannot connect to the Docker daemon` / `npipe ... dockerDesktopLinuxEngine`
Docker Desktop (its WSL2 engine) isn't running. Launch Docker Desktop, wait for
**"Engine running"**, retry.

### `npm: command not found` (only if building the SPA outside Docker)
You don't need npm on the host — the **web Docker image builds the SPA itself**.
Just `docker compose up --build`. (Node is only needed if you want to run
`npm install`/`vite` locally.)

---

## Login / authentication

### 502 on every call (including login)
The **api crashed on startup**. `docker compose logs --tail=40 api` and look for
a stack trace — usually a code/syntax error or a failed `require`. Fix and
`docker compose up -d --build api`.

### `invalid_token` / `wrong_tenant` / wrong issuer
The token isn't what the API expects. Checks:
- API app **Manifest** has `"requestedAccessTokenVersion": 2`; sign out and back in.
- `AZURE_TENANT_ID`, `API_CLIENT_ID`, `API_AUDIENCE` in `apps/api/.env` match the
  Governance API app (`API_AUDIENCE` = `api://<API_CLIENT_ID>`).

### `insufficient_scope` / `delegated access_as_user token required`
You're calling with an **app-only** token. The portal only accepts delegated
(signed-in user) tokens. Use the browser sign-in flow; service principals are
intentionally rejected. (SCIM uses its own separate token at `/scim/v2`.)

### "Auth not configured" on the sign-in screen
`config.js` wasn't populated. Ensure `AZURE_TENANT_ID`, `SPA_CLIENT_ID`,
`API_CLIENT_ID` are set in `deploy/.env`, then `docker compose up -d --build web`.

---

## Database / permissions

### `permission denied for table employees` (or any table)
The `governance_app` role is missing grants. Re-apply:
```powershell
docker compose exec db psql -U postgres -d governance -f /docker-entrypoint-initdb.d/900-grants.sql
docker compose restart api
```

### `relation "audit_log" / "quiz_attempts" does not exist`, or
### `column "manager_name" / "archived_at" does not exist`
The database is **missing migrations** (it predates a feature, or an init error
aborted the run). Replay all migrations (idempotent) then restart:
```powershell
docker compose exec db sh -c "for f in /docker-entrypoint-initdb.d/*.sql; do echo == $f; psql -U postgres -d governance -f \"$f\"; done"
docker compose restart api
```

### Init-ordering bug (fresh deploy missing later tables)
Symptom: a from-scratch deploy fails at one migration (e.g. `group_mappings does
not exist`) and everything after it is missing. Cause: init scripts must sort in
the right order. The shipped compose uses **same-width prefixes**
(`010…170`, `900`) so this can't happen — make sure you're on the current
`deploy/docker-compose.yml`. To redo cleanly: `docker compose down -v` then
`docker compose up --build -d` (⚠ wipes data — back up first).

### `password authentication failed for user "governance_app"`
`APP_DB_PASSWORD` in `deploy/.env` doesn't match what the role was created with
(common when reusing an old DB volume). Either set it to the original value, or
reset the role:
```powershell
docker compose exec db psql -U postgres -d governance -c "alter role governance_app with password '<APP_DB_PASSWORD>';"
```

---

## Application behaviour

### A button/screen goes blank
A front-end runtime error. Hard-refresh (Ctrl+F5). If it persists, open the
browser **DevTools → Console**, read the error, and check it after the latest
`docker compose up -d --build web`. (Past cause: a referenced component missing
after an edit — fixed by rebuilding web with the current bundle.)

### "Sync failed: ..." 
- `Parsing OData Select and Expand failed ... 'manager'` → ensure you're on the
  current build (members are cast to `microsoft.graph.user`).
- `req is not defined` / 500 → check `docker compose logs api` for the real line.
- Empty results → the app only sees principals **assigned** to the enterprise app
  (or in the Administrative Unit / SCIM scope) — assign your governance groups.

### Reminders / confirmation emails not sending
They no-op unless configured: set `GRAPH_MAIL_SENDER` (a real mailbox) in
`apps/api/.env` and grant Graph **`Mail.Send`** (application) with admin consent.
The "Send reminders" button reports "not configured" until then. Signing still
works regardless (email is fire-and-forget).

### SharePoint file won't open / 403 / "Empty Payload"
Check the `Sites.Selected` per-site grant (§5d of INSTALLATION) actually returned
`201`/has `read`. Confirm `SHAREPOINT_SITE_ID` is the site where the documents
live.

### "Browse SharePoint" shows "This folder is empty"
The app reads the configured library/folder via Graph; confirm the documents are
in that site's document library and the app has read on the site.

---

## Backups & reset
- **Manual backup:** Backups screen → Download, or `deploy/scripts/backup-all.ps1`.
- **Restore:** see `RESTORE.md`.
- **Wipe to clean state (keep schema):** `deploy/scripts/reset.ps1` (see `RESET.md`).
- **Full wipe (re-run all migrations):** `docker compose down -v` then
  `docker compose up --build -d` — destroys the DB volume, so back up first.

## Still stuck?
Capture and review together:
```powershell
docker compose ps
docker compose logs --tail=60 api
docker compose logs --tail=60 db
```
The `error:` line in the api/db logs almost always names the exact cause
(missing column, permission, bad token, connection).
