#!/bin/sh
# Runs ONCE on first DB init (alphabetically first in /docker-entrypoint-initdb.d).
# Creates the least-privilege application login. The schema is owned by the
# superuser (POSTGRES_USER); this role only gets the grants in docker-grants.sql,
# which is how the append-only signatures ledger is enforced.
set -e

: "${APP_DB_PASSWORD:?APP_DB_PASSWORD must be set (see .env)}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
  create role governance_app login password '${APP_DB_PASSWORD}';
SQL
