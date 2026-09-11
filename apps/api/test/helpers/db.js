// ============================================================
//  Integration-test database helper.
//  Applies the REAL schema + every migration + grants to a throwaway
//  Postgres, exactly in the docker-compose order, then offers reset/
//  truncate/seed utilities. Tests skip gracefully if no DB is reachable.
//
//  Connection (override via env):
//    DATABASE_URL              app role  (default local ephemeral cluster)
//    TEST_SUPER_DATABASE_URL   superuser (schema apply + truncate + seed)
// ============================================================
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const APP_URL = process.env.DATABASE_URL || 'postgres://governance_app:apppw@127.0.0.1:55432/governance';
const SUPER_URL = process.env.TEST_SUPER_DATABASE_URL || 'postgres://postgres@127.0.0.1:55432/governance';
const DB_DIR = path.resolve(__dirname, '../../db');

// docker-compose initdb order (role creation handled separately below).
const FILES = [
  'schema.sql',
  'migration_002_groups.sql', 'migration_003_group_mapping.sql', 'migration_004_archive.sql',
  'migration_005_map_any_group.sql', 'migration_006_audit.sql', 'migration_007_group_archive.sql',
  'migration_008_managers.sql', 'migration_009_due_date.sql', 'migration_010_due_days.sql',
  'migration_011_quizzes.sql', 'migration_012_quiz_archive.sql', 'migration_013_notifications.sql',
  'migration_014_review_history.sql', 'migration_015_owner_user.sql', 'migration_016_trainings.sql',
  'migration_017_integrations.sql', 'migration_018_effective_membership.sql',
  'migration_019_approvals.sql', 'migration_020_approval_steps.sql',
  'migration_021_approval_templates.sql', 'migration_022_group_approvers.sql',
  'migration_023_ledger_fk_restrict.sql', 'migration_024_audit_outbox.sql', 'migration_025_gdpr_approver_nullable.sql',
  'migration_026_immutable_revisions.sql', 'docker-grants.sql',
];

const DATA_TABLES = [
  'notifications_sent', 'quiz_attempts', 'quiz_questions', 'quizzes', 'policy_versions',
  'policy_approvals', 'policy_approvers', 'policy_approval_steps', 'policy_approver_groups',
  'approval_workflow_step_approvers', 'approval_workflow_step_groups', 'approval_workflow_steps', 'approval_workflows',
  'policy_groups', 'signatures', 'policy_revisions', 'policies', 'employee_groups', 'group_mappings', 'groups',
  'employees', 'sync_runs', 'audit_log', 'audit_outbox', 'integration_config',
];

const superPool = new Pool({ connectionString: SUPER_URL });
const appPool = new Pool({ connectionString: APP_URL });

// Is a test database reachable? Tests call this and self-skip if false.
async function available() {
  try { await superPool.query('select 1'); return true; } catch { return false; }
}

// Drop & recreate the schema, ensure the app role exists, apply every SQL file.
async function applyAll() {
  await superPool.query(
    `do $$ begin if not exists (select from pg_roles where rolname='governance_app')
       then create role governance_app login password 'apppw'; end if; end $$;`);
  await superPool.query('drop schema if exists public cascade; create schema public;');
  for (const f of FILES) {
    await superPool.query(fs.readFileSync(path.join(DB_DIR, f), 'utf8'));
  }
}

// Wipe data between tests; restore the integration_config singleton row.
async function truncate() {
  await superPool.query(`truncate ${DATA_TABLES.join(', ')} restart identity cascade`);
  await superPool.query(`insert into integration_config (id) values (1) on conflict (id) do nothing`);
}

async function end() { await Promise.allSettled([superPool.end(), appPool.end()]); }

// ── Seed helpers (run as superuser; bypass append-only for setup) ──────────
let _g = 0;
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;

async function seedEmployee({ oid, name = 'User', email = 'u@x', status = 'Active', dept = 'Eng' } = {}) {
  oid = oid || uuid(++_g);
  await superPool.query(
    `insert into employees (oid, upn, email, display_name, department, status) values ($1,$2,$2,$3,$4,$5)`,
    [oid, email, name, dept, status]);
  return oid;
}
async function seedGroup({ id, name, kind = 'Local', source = 'Local' } = {}) {
  id = id || uuid(++_g);
  name = name || `G${_g}`;
  await superPool.query(`insert into groups (id, name, kind, source) values ($1,$2,$3,$4)`, [id, name, kind, source]);
  return id;
}
async function addMember(employeeOid, groupId) {
  await superPool.query(`insert into employee_groups (employee_oid, group_id) values ($1,$2) on conflict do nothing`, [employeeOid, groupId]);
}
async function mapGroup(adGroupId, platformGroupId) {
  await superPool.query(`insert into group_mappings (ad_group_id, platform_group_id) values ($1,$2) on conflict do nothing`, [adGroupId, platformGroupId]);
}
async function seedPolicy({ id, name = 'Policy', docType = 'Policy', version = 'v1', ownerOid = null, groupIds = [], source = 'SharePoint' } = {}) {
  id = id || uuid(++_g);
  await superPool.query(
    `insert into policies (id, name, doc_type, version, sharepoint_url, owner_oid, source)
     values ($1,$2,$3,$4,'https://sp/doc',$5,$6)`, [id, name, docType, version, ownerOid, source]);
  for (const g of groupIds) await superPool.query(`insert into policy_groups (policy_id, group_id) values ($1,$2)`, [id, g]);
  return id;
}
async function seedQuiz(policyId, { passPct = 50, questions = [{ prompt: 'Q1', options: ['a', 'b'], correctIndex: 0, points: 1 }] } = {}) {
  const q = (await superPool.query(`insert into quizzes (policy_id, title, pass_pct) values ($1,'KC',$2) returning id`, [policyId, passPct])).rows[0];
  let pos = 0; const ids = [];
  for (const qq of questions) {
    const r = await superPool.query(
      `insert into quiz_questions (quiz_id, position, prompt, options, correct_index, points) values ($1,$2,$3,$4,$5,$6) returning id`,
      [q.id, pos++, qq.prompt, JSON.stringify(qq.options), qq.correctIndex, qq.points]);
    ids.push(r.rows[0].id);
  }
  return { quizId: q.id, questionIds: ids };
}

module.exports = {
  superPool, appPool, available, applyAll, truncate, end, APP_URL,
  seedEmployee, seedGroup, addMember, mapGroup, seedPolicy, seedQuiz, uuid,
};
