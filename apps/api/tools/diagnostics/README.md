# Diagnostics — pinpoint where a problem is

A set of **independently-runnable** subsystem checks. Each reports `PASS` / `WARN`
/ `FAIL` / `SKIP` with a one-line remediation hint, so you can localise a problem
to a layer (config, DB, identity, API, Graph, integrations, backups, web) instead
of guessing. Pure Node — no extra dependencies.

## Run

```bash
# everything (from apps/api)
npm run diagnose
# or a subset of subsystems
node tools/diagnostics/diagnose.js db api identity
# one subsystem, standalone
node tools/diagnostics/db.check.js
# machine-readable (for tickets/automation)
node tools/diagnostics/diagnose.js --json
node tools/diagnostics/diagnose.js --list      # list subsystems
node tools/diagnostics/diagnose.js graph --deep # also try an authenticated Graph call
```

In containers:

```bash
docker compose exec api node tools/diagnostics/diagnose.js          # api-side groups
docker compose exec web node tools/diagnostics/web.check.js          # web tier (if node present)
```

**Exit code:** `0` all pass · `1` warnings only · `2` at least one failure — so it
slots into CI or a health script.

## Subsystems and where to run them

| Group | Checks | Run where |
|-------|--------|-----------|
| `config` | required env present & sane (tenant/client ids, DATABASE_URL, CORS, Graph creds, SharePoint, mail) | api |
| `db` | connectivity, least-privilege role, all tables/views present (→ which migration is missing), **append-only enforced**, data sanity | api |
| `identity` | JWKS endpoint reachable + serving keys, OpenID discovery issuer matches | api (needs egress) |
| `api` | `/healthz` ok, anonymous `/api/me` is 401 (auth active), correlation-id header | anywhere that can reach the API (`DIAG_API_URL`) |
| `graph` | egress to graph.microsoft.com, SharePoint site configured, (`--deep`) authenticated call | api (needs egress) |
| `integration` | `integration_config` present, forward URL safe+reachable, last forward status, feed key set | api |
| `backups` | `/backups` writable, `pg_dump` present, a recent backup exists | api (backups volume) |
| `web` | TLS cert present & not expiring, runtime `config.js` populated, security headers | web container / host |

## Useful environment overrides

- `DIAG_API_URL` — API base for the `api` group (default `http://127.0.0.1:8080`).
- `DIAG_BACKUP_DIR` — backups path (default `/backups`).
- `DIAG_CERTS_DIR` / `DIAG_CONFIG_JS` / `DIAG_WEB_URL` — for the `web` group.
- `NO_COLOR=1` — plain output. `--json` — structured output.

## How it pinpoints

Checks are ordered so a root cause short-circuits noise: e.g. if `db` can't
connect, the dependent checks `SKIP` (not fail) so the report shows the single
real problem. A missing table/view names the migration that introduces it. The
`api` and `identity`/`graph` groups separate "is the process up" from "can it
reach Entra/Graph", so a green `api` + red `identity` tells you it's an egress
problem, not the app.
