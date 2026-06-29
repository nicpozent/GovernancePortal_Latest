// Subsystem: database connectivity & integrity. Run: node tools/diagnostics/db.check.js
const path = require('path');
const cfg = require(path.resolve(__dirname, '../../src/config'));
const { pass, warn, fail, skip, diagPool, runGroup, printGroup, summarize } = require('./lib');

// Tables/views every healthy deployment must have, mapped to the migration that
// introduces them — so a missing one points straight at the unapplied migration.
const REQUIRED_TABLES = {
  employees: 'schema.sql', policies: 'schema.sql', signatures: 'schema.sql',
  groups: 'migration_002', employee_groups: 'migration_002', group_mappings: 'migration_003',
  audit_log: 'migration_006', quizzes: 'migration_011', quiz_attempts: 'migration_011',
  notifications_sent: 'migration_013', policy_versions: 'migration_014', integration_config: 'migration_017',
};
const REQUIRED_VIEWS = { group_effective_members: 'migration_005', effective_group_membership: 'migration_018' };
const APPEND_ONLY = ['signatures', 'audit_log', 'quiz_attempts'];

async function build() {
  const pool = diagPool(cfg.databaseUrl);
  const checks = [];
  let connected = false;

  checks.push({ title: 'API can connect to the database', run: async () => {
    try { await pool.query('select 1'); connected = true; return pass('API can connect to the database', new URL(cfg.databaseUrl).host); }
    catch (e) { return fail('API can connect to the database', e.message, 'Is the db container up and healthy? Check DATABASE_URL host/password and `docker compose ps`.'); }
  } });

  checks.push({ title: 'Connected as the least-privilege app role', run: async () => {
    if (!connected) return skip('Connected as the least-privilege app role', 'no connection');
    const who = (await pool.query('select current_user as u')).rows[0].u;
    if (who === 'governance_app') return pass('Connected as the least-privilege app role', who);
    return warn('Connected as the least-privilege app role', `connected as "${who}"`, 'The API should connect as governance_app, not a superuser — check the DATABASE_URL user.');
  } });

  checks.push({ title: 'Required tables present (schema + migrations applied)', run: async () => {
    if (!connected) return skip('Required tables present', 'no connection');
    const rows = (await pool.query("select table_name from information_schema.tables where table_schema='public'")).rows.map((r) => r.table_name);
    const missing = Object.entries(REQUIRED_TABLES).filter(([t]) => !rows.includes(t));
    if (!missing.length) return pass('Required tables present', `${Object.keys(REQUIRED_TABLES).length} core tables`);
    return fail('Required tables present', `missing: ${missing.map(([t]) => t).join(', ')}`,
      `Apply the migration(s) that create them: ${[...new Set(missing.map(([, m]) => m))].join(', ')}.`);
  } });

  checks.push({ title: 'Required views present', run: async () => {
    if (!connected) return skip('Required views present', 'no connection');
    const rows = (await pool.query("select table_name from information_schema.views where table_schema='public'")).rows.map((r) => r.table_name);
    const missing = Object.entries(REQUIRED_VIEWS).filter(([v]) => !rows.includes(v));
    if (!missing.length) return pass('Required views present', Object.keys(REQUIRED_VIEWS).join(', '));
    return fail('Required views present', `missing: ${missing.map(([v]) => v).join(', ')}`,
      `Apply ${[...new Set(missing.map(([, m]) => m))].join(', ')} (e.g. effective_group_membership comes from migration_018).`);
  } });

  checks.push({ title: 'Append-only ledgers cannot be mutated by the app role', run: async () => {
    if (!connected) return skip('Append-only ledgers enforced', 'no connection');
    const rows = (await pool.query(
      `select table_name, privilege_type from information_schema.role_table_grants
        where grantee = current_user and table_name = any($1) and privilege_type in ('UPDATE','DELETE')`, [APPEND_ONLY])).rows;
    if (!rows.length) return pass('Append-only ledgers enforced', `${APPEND_ONLY.join(', ')} are insert-only`);
    const leaks = rows.map((r) => `${r.table_name}:${r.privilege_type}`).join(', ');
    return fail('Append-only ledgers enforced', `app role HAS ${leaks}`, 'Re-run docker-grants.sql — the REVOKE on the ledgers did not take. Compliance integrity is at risk.');
  } });

  checks.push({ title: 'Data sanity (employees / policies present)', run: async () => {
    if (!connected) return skip('Data sanity', 'no connection');
    const e = (await pool.query('select count(*)::int n from employees')).rows[0].n;
    const p = (await pool.query('select count(*)::int n from policies')).rows[0].n;
    if (e === 0) return warn('Data sanity', `${e} employees, ${p} policies`, 'No employees — has a directory sync run yet? POST /api/sync or check the scheduler.');
    return pass('Data sanity', `${e} employees, ${p} policies`);
  } });

  return { pool, group: { id: 'db', title: 'Database connectivity & integrity', checks } };
}

module.exports = { build };
if (require.main === module) {
  (async () => {
    const { pool, group } = await build();
    const results = await runGroup(group);
    const json = process.argv.includes('--json');
    if (json) process.stdout.write(JSON.stringify({ group: group.id, results }, null, 2) + '\n');
    else printGroup(group, results);
    await pool.end();
    process.exit(json ? (results.some((r) => r.status === 'fail') ? 2 : 0) : summarize(results));
  })();
}
