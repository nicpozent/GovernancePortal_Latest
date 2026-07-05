// Integration tests for the GDPR data-subject tooling (Art. 15 export, Art. 17
// erasure, retention purge). The export path is exercised through the admin API
// (supertest); erasure/retention are exercised directly against a privileged
// connection, exactly as the CLI (db/gdpr.js) runs them — they DELETE ledger
// rows the app role is REVOKE'd from touching, so they need the superuser conn.
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const db = require('../helpers/db');
const h = require('../helpers/app');
const { eraseSubject, purgeRetention } = require('../../src/gdpr');

let dbUp = false;
test.before(async () => { dbUp = await db.available(); if (dbUp) await db.applyAll(); });
test.beforeEach(async () => { if (dbUp) await db.truncate(); });
test.after(async () => { await db.end(); try { await h.pool.end(); } catch (_) {} });

// Seed a subject with data across every personal table; returns the oid + ids.
async function seedSubject() {
  const admin = await db.seedEmployee({ name: 'Admin' });
  const subject = await db.seedEmployee({ name: 'Dana Subject', email: 'dana@x' });
  const grp = await db.seedGroup({ kind: 'Local', name: 'Finance' });
  await db.addMember(subject, grp);
  const pol = await db.seedPolicy({ version: 'v1', groupIds: [grp] });
  await db.superPool.query(
    `insert into signatures (policy_id, policy_version, user_oid, full_name, acknowledged, ip_address, user_agent)
     values ($1,'v1',$2,'Dana Subject',true,'203.0.113.7','test-agent')`, [pol, subject]);
  const { quizId } = await db.seedQuiz(pol, { questions: [{ prompt: 'Q', options: ['a', 'b'], correctIndex: 0, points: 1 }] });
  await db.superPool.query(
    `insert into quiz_attempts (quiz_id, policy_id, user_oid, attempt_no, score, max_score, pct, passed)
     values ($1,$2,$3,1,1,1,100,true)`, [quizId, pol, subject]);
  await db.superPool.query(
    `insert into notifications_sent (policy_id, user_oid, milestone, policy_version) values ($1,$2,'assigned','v1')`, [pol, subject]);
  await db.superPool.query(
    `insert into audit_log (actor_oid, actor_name, action, target) values ($1,'Dana Subject','signature.create',$2)`, [subject, pol]);
  return { admin, subject, pol };
}

test('DSAR export returns the full per-subject package (admin only, audited)', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const { admin, subject } = await seedSubject();

  // Non-admin must not reach it.
  h.asUser(subject, []);
  assert.equal((await request(h.app).get(`/api/admin/data-subject/${subject}/export`)).status, 403);

  h.asAdmin(admin);
  const res = await request(h.app).get(`/api/admin/data-subject/${subject}/export`);
  assert.equal(res.status, 200);
  assert.equal(res.body.found, true);
  assert.equal(res.body.employee.display_name, 'Dana Subject');
  assert.deepEqual(res.body.counts, { signatures: 1, quizAttempts: 1, notifications: 1, groupMemberships: 1, auditActions: 1 });
  // The signature detail (incl. IP/user-agent we hold) is present for the subject.
  assert.equal(res.body.signatures[0].ip_address, '203.0.113.7');
  // The export itself is recorded in the audit log.
  const aud = (await db.superPool.query("select count(*)::int n from audit_log where action='gdpr.dsar.export'")).rows[0].n;
  assert.equal(aud, 1);
});

test('DSAR export is 404 for an unknown subject', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const admin = await db.seedEmployee({ name: 'Admin' });
  h.asAdmin(admin);
  const res = await request(h.app).get(`/api/admin/data-subject/${db.uuid(999)}/export`);
  assert.equal(res.status, 404);
});

test('eraseSubject deletes personal records and pseudonymises the audit trail', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const { subject } = await seedSubject();

  // Run erasure on a dedicated privileged connection (as the CLI does).
  const client = await db.superPool.connect();
  let removed;
  try { removed = await eraseSubject(client, subject); } finally { client.release(); }

  assert.equal(removed.employee, 1);
  assert.equal(removed.signatures, 1);
  assert.equal(removed.quizAttempts, 1);
  assert.equal(removed.notifications, 1);
  assert.equal(removed.auditPseudonymised, 1);

  // Personal records are gone.
  assert.equal((await db.superPool.query('select count(*)::int n from employees where oid=$1', [subject])).rows[0].n, 0);
  assert.equal((await db.superPool.query('select count(*)::int n from signatures where user_oid=$1', [subject])).rows[0].n, 0);
  // The audit EVENT survives, but the identity is scrubbed.
  const a = (await db.superPool.query("select actor_oid, actor_name from audit_log where action='signature.create'")).rows[0];
  assert.equal(a.actor_oid, null);
  assert.equal(a.actor_name, '[erased]');
});

test('purgeRetention removes records older than the cutoff and keeps recent ones', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const subject = await db.seedEmployee({ name: 'Old' });
  const pol = await db.seedPolicy({ version: 'v1' });
  // One 11-year-old signature and one recent one.
  await db.superPool.query(
    `insert into signatures (policy_id, policy_version, user_oid, full_name, signed_at)
     values ($1,'v1',$2,'Old', now() - interval '11 years'), ($1,'v1',$2,'Old', now())`, [pol, subject]);

  const cutoff = new Date(); cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 10);
  const client = await db.superPool.connect();
  let removed;
  try { removed = await purgeRetention(client, cutoff); } finally { client.release(); }

  assert.equal(removed.signatures, 1, 'only the 11-year-old signature should be purged');
  assert.equal((await db.superPool.query('select count(*)::int n from signatures where user_oid=$1', [subject])).rows[0].n, 1,
    'the recent signature must remain');
});
