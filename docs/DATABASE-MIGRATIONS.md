# Database migrations

The portal ships a lightweight **migration runner** (`apps/api/db/migrate.js`) that
applies the ordered SQL migrations idempotently, tracked in a `schema_migrations`
table — so it works on a **fresh** database *and* safely upgrades an **existing**
one. This replaces the previous reliance on `docker-entrypoint-initdb.d`, which
only runs on a brand-new volume (and so can't apply migrations added later).

## Why a runner (the gap it closes)
- `docker-entrypoint-initdb.d` scripts execute **once, only on first DB init**.
  Adding `migration_019_*.sql` later would never run on an already-provisioned
  database — a real upgrade hazard.
- The runner records each applied file in `schema_migrations(version, applied_at)`
  and applies only what's pending, each in its own transaction. Re-running is a
  no-op. `docker-grants.sql` (grants + append-only REVOKEs) is idempotent and is
  **re-applied every run** so new tables get correct privileges.

## Ownership model (important)
Migrations create/own schema objects, so the runner connects as an
**admin/superuser** (`ADMIN_DATABASE_URL`), **not** the least-privilege app role
(`governance_app`) the API uses at runtime. This preserves the integrity model:
tables are owned by the superuser; the app role only has the granted rights, and
UPDATE/DELETE on the ledgers stay revoked.

## Commands (from `apps/api`)
```bash
# Apply all pending migrations (creates the app role too if APP_DB_PASSWORD set)
ADMIN_DATABASE_URL=postgres://postgres:<pw>@<host>:5432/governance \
APP_DB_PASSWORD=<app pw> \
npm run migrate

npm run migrate -- --status     # list applied vs pending
npm run migrate -- --baseline   # mark all current migrations applied WITHOUT
                                 # running them — for a DB already built by initdb
```

## Adopting it on an EXISTING (initdb-provisioned) database
The schema is already there; you just need to record it so future migrations run:
```bash
ADMIN_DATABASE_URL=postgres://postgres:<pw>@<host>:5432/governance npm run migrate -- --baseline
```
This creates `schema_migrations`, marks `schema.sql`…`migration_018` as applied
(no SQL run), and reconciles grants. From then on, `npm run migrate` applies only
new files.

## Adopting it on a FRESH database
`npm run migrate` alone builds everything from empty (it also creates the
`governance_app` role when `APP_DB_PASSWORD` is set). Verified end-to-end:
18 migrations apply, both views exist, and the append-only REVOKEs are in force.

## Wiring into docker-compose (recommended going forward)
Two supported patterns:

1. **Keep initdb for first boot (current default), use the runner for upgrades.**
   After pulling new migrations, run once against the live DB:
   ```powershell
   docker compose exec -e ADMIN_DATABASE_URL=postgres://postgres:$env:POSTGRES_PASSWORD@db:5432/governance api npm run migrate
   ```
   (First time on an already-running stack: use `--baseline` as above.)

2. **Make the runner the single source of truth (cleaner long-term).**
   Add a one-shot migrate step before the API serves. Sketch:
   ```yaml
   migrate:
     build: ../apps/api
     command: ["npm","run","migrate"]
     environment:
       ADMIN_DATABASE_URL: postgres://postgres:${POSTGRES_PASSWORD}@db:5432/governance
       APP_DB_PASSWORD: ${APP_DB_PASSWORD}
     depends_on: { db: { condition: service_healthy } }
   # api: depends_on: { migrate: { condition: service_completed_successfully } }
   ```
   Then drop the `schema.sql`/`migration_*` mounts from the `db` service (keep
   `docker-init-role.sh` only, or let the runner create the role). This makes every
   environment converge through the same tracked, versioned path.
   _(Deferred as default here to avoid changing the working first-boot flow; adopt
   when you're ready to validate the compose change.)_

## Adding a new migration
1. Create `apps/api/db/migration_019_<name>.sql` (idempotent-friendly:
   `create table if not exists`, `create or replace view`, and `grant … ; revoke …`
   for any new table so least privilege holds).
2. Append its filename to the `MIGRATIONS` array in `apps/api/db/migrate.js`
   (and, if you still use the initdb path for fresh installs, add the mount in
   `deploy/docker-compose.yml` with the next numeric prefix).
3. Run `npm run migrate` against each environment. The integration test harness
   applies the same ordered set, so `npm run test:all` also exercises it.

## Alternatives considered
A full framework (Flyway / Liquibase / node-pg-migrate) is viable, but the raw
`.sql` files are already the source of truth and the custom runner reuses them
verbatim with zero new runtime dependencies and an explicit ownership model. If
you later want up/down rollbacks or checksum verification, node-pg-migrate is the
natural upgrade.
