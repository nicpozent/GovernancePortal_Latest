#!/usr/bin/env node
// ============================================================
//  Database migration runner.
//
//  Applies the ordered SQL migrations that have NOT yet been applied,
//  tracked in a schema_migrations table — so it is safe to run repeatedly
//  and works on both a fresh and an already-provisioned database (unlike the
//  docker-entrypoint-initdb.d mounts, which only run on a brand-new volume).
//
//  Migrations create objects owned by the schema OWNER, so this connects as an
//  ADMIN/superuser (ADMIN_DATABASE_URL), NOT the least-privilege app role.
//  docker-grants.sql (grants + append-only REVOKEs) is idempotent and is
//  re-applied on every run to reconcile privileges after new tables appear.
//
//  Usage (from apps/api):
//    ADMIN_DATABASE_URL=postgres://postgres:***@host:5432/governance \
//    APP_DB_PASSWORD=*** npm run migrate            # apply pending migrations
//    npm run migrate -- --baseline                  # mark all as applied w/o running
//                                                    # (for a DB already built by initdb)
//    npm run migrate -- --status                    # list applied / pending
// ============================================================
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const DIR = __dirname;
// Canonical ordered migration set (same order as docker-compose initdb).
// docker-grants.sql is handled separately (always re-applied, idempotent).
const MIGRATIONS = [
  'schema.sql',
  'migration_002_groups.sql', 'migration_003_group_mapping.sql', 'migration_004_archive.sql',
  'migration_005_map_any_group.sql', 'migration_006_audit.sql', 'migration_007_group_archive.sql',
  'migration_008_managers.sql', 'migration_009_due_date.sql', 'migration_010_due_days.sql',
  'migration_011_quizzes.sql', 'migration_012_quiz_archive.sql', 'migration_013_notifications.sql',
  'migration_014_review_history.sql', 'migration_015_owner_user.sql', 'migration_016_trainings.sql',
  'migration_017_integrations.sql', 'migration_018_effective_membership.sql',
];
const GRANTS = 'docker-grants.sql';

const CONN = process.env.ADMIN_DATABASE_URL || process.env.DATABASE_URL;
const args = process.argv.slice(2);
const baseline = args.includes('--baseline');
const statusOnly = args.includes('--status');

async function main() {
  if (!CONN) { console.error('Set ADMIN_DATABASE_URL (a superuser/owner connection).'); process.exit(2); }
  const c = new Client({ connectionString: CONN });
  await c.connect();
  try {
    await c.query(`create table if not exists schema_migrations (
      version text primary key, applied_at timestamptz not null default now())`);
    const applied = new Set((await c.query('select version from schema_migrations')).rows.map((r) => r.version));
    const pending = MIGRATIONS.filter((m) => !applied.has(m));

    if (statusOnly) {
      console.log(`applied: ${applied.size} | pending: ${pending.length}`);
      for (const m of MIGRATIONS) console.log(`  ${applied.has(m) ? '✓' : '·'} ${m}`);
      return;
    }

    // Ensure the least-privilege app role exists (mirrors docker-init-role.sh) so
    // the grants step succeeds even on a from-empty run.
    if (process.env.APP_DB_PASSWORD) {
      const pw = process.env.APP_DB_PASSWORD.replace(/'/g, "''");
      await c.query(`do $$ begin if not exists (select from pg_roles where rolname='governance_app')
        then execute format('create role governance_app login password %L', '${pw}'); end if; end $$;`);
    }

    if (baseline) {
      for (const m of pending) await c.query('insert into schema_migrations(version) values ($1) on conflict do nothing', [m]);
      console.log(`baselined ${pending.length} migration(s) as already-applied (no SQL run).`);
    } else {
      if (!pending.length) console.log('no pending migrations.');
      for (const m of pending) {
        const sql = fs.readFileSync(path.join(DIR, m), 'utf8');
        await c.query('begin');
        try {
          await c.query(sql);
          await c.query('insert into schema_migrations(version) values ($1)', [m]);
          await c.query('commit');
          console.log(`applied ${m}`);
        } catch (e) { await c.query('rollback'); throw new Error(`migration ${m} failed: ${e.message}`); }
      }
    }

    // Always reconcile privileges (idempotent) so new tables get the correct
    // grants and the append-only REVOKEs on the ledgers are re-asserted.
    await c.query(fs.readFileSync(path.join(DIR, GRANTS), 'utf8'));
    console.log('reconciled grants (docker-grants.sql).');
  } finally {
    await c.end();
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
