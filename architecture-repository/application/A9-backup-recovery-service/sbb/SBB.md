# SBB — pg_dump + retention + restore docs

_Solution Building Block realizing ABB **A9 Backup & Recovery Service** in the Birgma Governance Portal._

## Realization
Daily dump (retained); manual/server-side backups; DB creds passed via PG* env, never argv (L-3).

## Where it lives (code)
`apps/api/src/server.js, routes.js (/admin/backup*), docs/RESTORE.md`

## Maturity
Production-grade
