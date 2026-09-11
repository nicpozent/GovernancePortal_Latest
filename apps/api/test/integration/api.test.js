// Integration / regression tests at the API layer (supertest + real Postgres).
// These lock in observable endpoint behaviour so the routes.js split can be
// verified to change nothing. Auth is stubbed (see helpers/app.js); the REAL
// requireAdmin/requireManager guards and all SQL run unchanged.
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const db = require('../helpers/db');
const h = require('../helpers/app');
const cfg = require('../../src/config');

let dbUp = false;
test.before(async () => { dbUp = await db.available(); if (dbUp) await db.applyAll(); });
test.beforeEach(async () => { if (dbUp) await db.truncate(); });
test.after(async () => { await db.end(); try { await h.pool.end(); } catch (_) {} });

test('GET /healthz is open and returns ok', async () => {
  const res = await request(h.app).get('/healthz');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
});

test('CSP allows blob: for the in-app document preview (PDF/image/video)', async () => {
  const csp = (await request(h.app).get('/healthz')).headers['content-security-policy'] || '';
  assert.match(csp, /frame-src[^;]*blob:/, 'blob: must be allowed in frame-src (PDF iframe preview)');
  assert.match(csp, /img-src[^;]*blob:/, 'blob: must be allowed in img-src (image preview)');
  assert.match(csp, /media-src[^;]*blob:/, 'blob: must be allowed in media-src (video preview)');
  assert.match(csp, /default-src 'self'/, 'default-src stays self (hardening preserved)');
});

test('GET /api/me requires authentication', async (t) => {
  if (!dbUp) return t.skip('no test database');
  h.anon();
  const res = await request(h.app).get('/api/me');
  assert.equal(res.status, 401);
});

test('requireAdmin gates admin-only endpoints', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const reg = await db.seedEmployee({ name: 'Reg' });
  h.asUser(reg, []);
  assert.equal((await request(h.app).get('/api/employees')).status, 403);
  h.asAdmin(reg);
  assert.equal((await request(h.app).get('/api/employees')).status, 200);
});

test('policy visibility: members see assigned policies; non-members do not', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const member = await db.seedEmployee({ name: 'Member' });
  const outsider = await db.seedEmployee({ name: 'Outsider' });
  const grp = await db.seedGroup({ kind: 'Local' });
  await db.addMember(member, grp);
  const pol = await db.seedPolicy({ name: 'Code of Conduct', groupIds: [grp] });

  h.asUser(member, []);
  const seen = (await request(h.app).get('/api/policies')).body;
  assert.ok(seen.find((p) => p.id === pol), 'member should see the assigned policy');
  assert.equal(seen.find((p) => p.id === pol).status, 'pending');

  h.asUser(outsider, []);
  const notseen = (await request(h.app).get('/api/policies')).body;
  assert.equal(notseen.find((p) => p.id === pol), undefined, 'non-member must not see it');
});

test('create policy: an admin who is not a synced employee does not 500 (owner_oid FK guard)', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const ghostAdmin = db.uuid(9999);              // an oid with NO employees row
  h.asAdmin(ghostAdmin);
  const res = await request(h.app).post('/api/policies').send({
    name: 'Remote Work Policy', docType: 'Policy', version: 'v1.0',
    sharepointUrl: 'https://sp/doc', ownerOid: ghostAdmin, groupIds: [],
  });
  assert.equal(res.status, 201, 'save must not fail with server_error when the admin is not an employee');
  const row = (await db.superPool.query('select owner_oid, owner from policies where id=$1', [res.body.id])).rows[0];
  assert.equal(row.owner_oid, null, 'an unknown owner oid is stored as NULL, not an FK violation');

  // A real employee owner is preserved (name + oid).
  const emp = await db.seedEmployee({ name: 'Real Owner' });
  const res2 = await request(h.app).post('/api/policies').send({
    name: 'Travel Policy', docType: 'Policy', version: 'v1.0', sharepointUrl: 'https://sp/doc', ownerOid: emp, groupIds: [],
  });
  assert.equal(res2.status, 201);
  const row2 = (await db.superPool.query('select owner_oid, owner from policies where id=$1', [res2.body.id])).rows[0];
  assert.equal(row2.owner_oid, emp);
  assert.equal(row2.owner, 'Real Owner');
});

test('canRead: document endpoint is 403 for a non-member, 200 for a member', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const member = await db.seedEmployee({});
  const outsider = await db.seedEmployee({});
  const grp = await db.seedGroup({ kind: 'Local' });
  await db.addMember(member, grp);
  const pol = await db.seedPolicy({ groupIds: [grp] }); // link-only (no drive/item) → no Graph call

  h.asUser(outsider, []);
  assert.equal((await request(h.app).get(`/api/policies/${pol}/document`)).status, 403);
  h.asUser(member, []);
  const ok = await request(h.app).get(`/api/policies/${pol}/document`);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.webUrl, 'https://sp/doc');
});

test('sign flow: member acknowledges and the policy becomes signed', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const member = await db.seedEmployee({});
  const grp = await db.seedGroup({ kind: 'Local' });
  await db.addMember(member, grp);
  const pol = await db.seedPolicy({ version: 'v1', groupIds: [grp] });

  h.asUser(member, []);
  const signed = await request(h.app).post('/api/signatures').send({ policyId: pol, fullName: 'A Member', acknowledged: true });
  assert.equal(signed.status, 201);

  const after = (await request(h.app).get('/api/policies')).body.find((p) => p.id === pol);
  assert.equal(after.status, 'signed');
});

test('quiz gate: cannot sign until the knowledge check is passed', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const member = await db.seedEmployee({});
  const grp = await db.seedGroup({ kind: 'Local' });
  await db.addMember(member, grp);
  const pol = await db.seedPolicy({ version: 'v1', groupIds: [grp] });
  const { questionIds } = await db.seedQuiz(pol, { passPct: 50, questions: [{ prompt: 'Q', options: ['right', 'wrong'], correctIndex: 0, points: 1 }] });

  h.asUser(member, []);
  // Signing is blocked before passing.
  const blocked = await request(h.app).post('/api/signatures').send({ policyId: pol, fullName: 'M', acknowledged: true });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.error, 'quiz_required');

  // Pass the quiz (correct answer = index 0), then signing succeeds.
  const attempt = await request(h.app).post(`/api/policies/${pol}/quiz/attempt`).send({ answers: { [questionIds[0]]: 0 } });
  assert.equal(attempt.status, 200);
  assert.equal(attempt.body.passed, true);
  const ok = await request(h.app).post('/api/signatures').send({ policyId: pol, fullName: 'M', acknowledged: true });
  assert.equal(ok.status, 201);
});

test('policy create is transactional: a bad group id leaves no half-written policy (#22)', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const admin = await db.seedEmployee({ name: 'Admin' });
  const grp = await db.seedGroup({ kind: 'Local' });
  h.asAdmin(admin);
  const bogus = db.uuid(990001); // valid format, but not a real group id → policy_groups FK violation mid-loop
  const before = (await db.superPool.query('select count(*)::int n from policies')).rows[0].n;
  const res = await request(h.app).post('/api/policies')
    .send({ name: 'Half', docType: 'Policy', version: 'v1', sharepointUrl: 'https://sp/x', groupIds: [grp, bogus] });
  assert.equal(res.status, 500, 'the FK violation fails the request');
  const after = (await db.superPool.query('select count(*)::int n from policies')).rows[0].n;
  assert.equal(after, before, 'no policy row persisted — the whole create rolled back');
  assert.equal((await db.superPool.query('select count(*)::int n from policies where name=$1', ['Half'])).rows[0].n, 0);
});

test('deleting a quiz with recorded attempts archives it and preserves the ledger (#8)', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const admin = await db.seedEmployee({ name: 'Admin' });
  const member = await db.seedEmployee({});
  const grp = await db.seedGroup({ kind: 'Local' });
  await db.addMember(member, grp);
  const pol = await db.seedPolicy({ version: 'v1', groupIds: [grp] });
  const { questionIds } = await db.seedQuiz(pol, { passPct: 50, questions: [{ prompt: 'Q', options: ['right', 'wrong'], correctIndex: 0, points: 1 }] });

  // A member records a (passing) attempt → one evidence row exists.
  h.asUser(member, []);
  assert.equal((await request(h.app).post(`/api/policies/${pol}/quiz/attempt`).send({ answers: { [questionIds[0]]: 0 } })).status, 200);
  const before = (await db.superPool.query('select count(*)::int n from quiz_attempts where policy_id=$1', [pol])).rows[0].n;
  assert.equal(before, 1);

  // Admin "deletes" the quiz → it is ARCHIVED, not hard-deleted, so the
  // append-only attempt ledger is preserved (pre-fix, ON DELETE CASCADE erased it).
  h.asAdmin(admin);
  const del = await request(h.app).delete(`/api/policies/${pol}/quiz`);
  assert.equal(del.status, 200);
  assert.equal(del.body.archived, true);
  assert.equal((await db.superPool.query('select count(*)::int n from quiz_attempts where policy_id=$1', [pol])).rows[0].n, 1, 'attempt ledger survives');
  const q = (await db.superPool.query('select archived_at from quizzes where policy_id=$1', [pol])).rows[0];
  assert.ok(q && q.archived_at, 'the quiz is archived, not removed');
});

test('quiz attempt cap is race-safe: concurrent submissions never exceed the limit', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const member = await db.seedEmployee({});
  const grp = await db.seedGroup({ kind: 'Local' });
  await db.addMember(member, grp);
  const pol = await db.seedPolicy({ groupIds: [grp] });
  const { questionIds } = await db.seedQuiz(pol, { passPct: 99, questions: [{ prompt: 'Q', options: ['a', 'b'], correctIndex: 0, points: 1 }] });

  h.asUser(member, []);
  // Fire more concurrent WRONG attempts than the cap; the advisory lock must serialize them.
  const wrong = { answers: { [questionIds[0]]: 1 } };
  const results = await Promise.all(Array.from({ length: 5 }, () => request(h.app).post(`/api/policies/${pol}/quiz/attempt`).send(wrong)));
  const accepted = results.filter((r) => r.status === 200).length;
  const rejected = results.filter((r) => r.status === 403).length;
  assert.equal(accepted, cfg.quizMaxAttempts, `exactly ${cfg.quizMaxAttempts} attempts should be accepted`);
  assert.equal(rejected, 5 - cfg.quizMaxAttempts);

  const count = (await db.superPool.query('select count(*)::int n from quiz_attempts where policy_id=$1 and user_oid=$2', [pol, member])).rows[0].n;
  assert.equal(count, cfg.quizMaxAttempts, 'no more than the cap may be persisted');
});

test('groups: admin creates a local group, lists it, and adds a member', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const admin = await db.seedEmployee({ name: 'Admin' });
  const person = await db.seedEmployee({ name: 'Joiner' });
  h.asAdmin(admin);

  const created = await request(h.app).post('/api/groups').send({ name: 'Finance', description: 'Finance team' });
  assert.equal(created.status, 201);
  const gid = created.body.id;

  const list = (await request(h.app).get('/api/groups')).body;
  assert.ok(list.find((g) => g.id === gid), 'new group should appear in the list');

  assert.equal((await request(h.app).post(`/api/groups/${gid}/members`).send({ employeeOid: person })).status, 204);
  const members = (await request(h.app).get(`/api/groups/${gid}/members`)).body;
  assert.ok(members.find((m) => m.oid === person), 'added member should be listed');
});

test('admin dashboard reflects required vs signed at the current version', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const admin = await db.seedEmployee({ name: 'Admin' });
  const member = await db.seedEmployee({});
  const grp = await db.seedGroup({ kind: 'Local' });
  await db.addMember(member, grp);
  const pol = await db.seedPolicy({ version: 'v1', groupIds: [grp] });

  h.asUser(member, []);
  await request(h.app).post('/api/signatures').send({ policyId: pol, fullName: 'M', acknowledged: true });

  h.asAdmin(admin);
  const row = (await request(h.app).get('/api/dashboard')).body.find((r) => r.id === pol);
  assert.equal(row.assigned, 1);
  assert.equal(row.signed, 1);
});
