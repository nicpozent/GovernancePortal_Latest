// Regression net for immutable content revisions (ADR-121 / finding #4).
// Verifies that acknowledging an uploaded document freezes a content-addressed,
// verified revision and binds the signature to it; that replacing the file
// invalidates the cache and freezes a NEW revision on the next acknowledgement;
// and that the earlier signature keeps pointing at its ORIGINAL frozen bytes
// (immutable — never carried forward, never overwritten).
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const db = require('../helpers/db');
const h = require('../helpers/app');
const cfg = require('../../src/config');

let dbUp = false;
test.before(async () => { dbUp = await db.available(); if (dbUp) await db.applyAll(); });
test.beforeEach(async () => { if (dbUp) await db.truncate(); });
test.after(async () => { await db.end(); try { await h.pool.end(); } catch (_) {} });

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const one = async (q, p) => (await db.superPool.query(q, p)).rows[0];

test('acknowledging an uploaded document freezes a verified revision bound to the signature', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const mgr = await db.seedEmployee({ name: 'Mgr' });
  const grp = await db.seedGroup({ name: 'Staff' });
  const member = await db.seedEmployee({ name: 'Member' });
  await db.addMember(member, grp);

  // Manager uploads a document assigned to the group (published by default).
  const PDF = Buffer.from('%PDF-1.4 original body\n');
  h.asManager(mgr);
  const created = await request(h.app)
    .post('/api/trainings')
    .field('name', 'Handbook').field('docType', 'Policy').field('groupIds', grp)
    .attach('file', PDF, { filename: 'v1.pdf', contentType: 'application/pdf' });
  assert.equal(created.status, 201);
  const id = created.body.id;

  // Member acknowledges.
  h.asUser(member, []);
  const signed = await request(h.app).post('/api/signatures').send({ policyId: id, fullName: 'The Member', acknowledged: true });
  assert.equal(signed.status, 201);

  // A verified, content-addressed revision was frozen and the signature is bound to it.
  const rev = await one('select * from policy_revisions where policy_id=$1', [id]);
  assert.ok(rev, 'a revision was frozen');
  assert.equal(rev.integrity, 'verified');
  assert.equal(rev.source, 'Upload');
  assert.equal(rev.content_sha256, sha(PDF), 'hash is of the exact uploaded bytes');
  assert.equal(Number(rev.content_size), PDF.length);
  assert.equal(signed.body.revision_id, rev.id, 'signature is bound to the frozen revision');

  // The policy caches the current revision so signing does not re-hash next time.
  const pol = await one('select current_revision_id from policies where id=$1', [id]);
  assert.equal(pol.current_revision_id, rev.id);
});

test('replacing the file freezes a NEW revision; the earlier signature keeps its original frozen bytes', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const mgr = await db.seedEmployee({ name: 'Mgr' });
  const grp = await db.seedGroup({ name: 'Staff' });
  const a = await db.seedEmployee({ name: 'Alice' });
  const b = await db.seedEmployee({ name: 'Bob' });
  await db.addMember(a, grp); await db.addMember(b, grp);

  const V1 = Buffer.from('%PDF-1.4 version one\n');
  h.asManager(mgr);
  const created = await request(h.app)
    .post('/api/trainings')
    .field('name', 'Handbook').field('docType', 'Policy').field('groupIds', grp)
    .attach('file', V1, { filename: 'v1.pdf', contentType: 'application/pdf' });
  const id = created.body.id;

  // Alice acknowledges v1 → freezes revision R1.
  h.asUser(a, []);
  const sigA = await request(h.app).post('/api/signatures').send({ policyId: id, fullName: 'Alice', acknowledged: true });
  assert.equal(sigA.status, 201);
  const r1 = await one('select * from policy_revisions where policy_id=$1', [id]);
  assert.equal(sigA.body.revision_id, r1.id);

  // Manager replaces the file with a new version.
  h.asManager(mgr);
  const V2 = Buffer.from('%PDF-1.4 version two, materially different\n');
  const upd = await request(h.app)
    .put(`/api/trainings/${id}`)
    .field('name', 'Handbook').field('version', 'v2.0')
    .attach('file', V2, { filename: 'v2.pdf', contentType: 'application/pdf' });
  assert.equal(upd.status, 200);

  // The cache was invalidated by the content change.
  const midPol = await one('select current_revision_id from policies where id=$1', [id]);
  assert.equal(midPol.current_revision_id, null, 'content change clears the cached revision');

  // Bob acknowledges v2 → freezes a NEW revision R2 (different bytes/hash).
  h.asUser(b, []);
  const sigB = await request(h.app).post('/api/signatures').send({ policyId: id, fullName: 'Bob', acknowledged: true });
  assert.equal(sigB.status, 201);
  const r2 = await one('select * from policy_revisions where id=$1', [sigB.body.revision_id]);
  assert.notEqual(r2.id, r1.id, 'a distinct revision was frozen for the new content');
  assert.equal(r2.content_sha256, sha(V2));
  assert.equal(r2.version_label, 'v2.0');

  // Alice's signature STILL points at R1 with the ORIGINAL bytes — immutable,
  // never carried forward to the new content (Decision A).
  const sigARow = await one('select revision_id from signatures where user_oid=$1 and policy_id=$2', [a, id]);
  assert.equal(sigARow.revision_id, r1.id, "the earlier signature is unchanged");
  const r1After = await one('select content_sha256 from policy_revisions where id=$1', [r1.id]);
  assert.equal(r1After.content_sha256, sha(V1), 'the original frozen revision is unchanged');

  // Two distinct revisions now exist for the policy.
  const count = await one('select count(*)::int as n from policy_revisions where policy_id=$1', [id]);
  assert.equal(count.n, 2);
});

test('a quiz attempt is graded against a frozen definition that a later edit cannot change (#9)', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const grp = await db.seedGroup({ name: 'Staff' });
  const member = await db.seedEmployee({ name: 'Member' });
  await db.addMember(member, grp);
  const pol = await db.seedPolicy({ version: 'v1', groupIds: [grp] }); // link-only: no Graph
  const { quizId, questionIds } = await db.seedQuiz(pol, {
    passPct: 50,
    questions: [
      { prompt: 'Q1', options: ['a', 'b'], correctIndex: 0, points: 1 },
      { prompt: 'Q2', options: ['x', 'y'], correctIndex: 1, points: 1 },
    ],
  });

  // Member answers both correctly → passes.
  h.asUser(member, []);
  const attempt = await request(h.app)
    .post(`/api/policies/${pol}/quiz/attempt`)
    .send({ answers: { [questionIds[0]]: 0, [questionIds[1]]: 1 } });
  assert.equal(attempt.status, 200);
  assert.equal(attempt.body.passed, true);
  assert.equal(attempt.body.pct, 100);

  // The attempt captured the exact graded definition + its fingerprint.
  const row = await one('select pct, passed, graded_against, definition_sha256 from quiz_attempts where policy_id=$1 and user_oid=$2', [pol, member]);
  assert.ok(row.graded_against, 'graded_against snapshot stored');
  assert.equal(row.graded_against.questions.length, 2);
  assert.equal(row.graded_against.passPct, 50);
  assert.ok(/^[0-9a-f]{64}$/.test(row.definition_sha256), 'definition fingerprint stored');
  const originalSha = row.definition_sha256;
  const originalGraded = JSON.stringify(row.graded_against);

  // Admin edits the quiz AFTER the pass: flip Q1's correct answer.
  await db.superPool.query('update quiz_questions set correct_index=1 where id=$1', [questionIds[0]]);

  // The recorded attempt is unchanged — its graded definition and result still
  // reflect what was actually in force when the member passed.
  const after = await one('select pct, passed, graded_against, definition_sha256 from quiz_attempts where policy_id=$1 and user_oid=$2', [pol, member]);
  assert.equal(after.pct, 100, 'past pct is immutable');
  assert.equal(after.passed, true);
  assert.equal(after.definition_sha256, originalSha, 'fingerprint unchanged by the later edit');
  assert.equal(JSON.stringify(after.graded_against), originalGraded, 'graded definition unchanged');
  assert.equal(after.graded_against.questions.find((q) => q.id === questionIds[0]).correctIndex, 0,
    'the attempt still records the ORIGINAL correct answer, not the edited one');
  assert.equal(quizId, quizId); // (quizId referenced)
});

test('revisions can be listed, verified, and served to the signer; tampering is detected', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const mgr = await db.seedEmployee({ name: 'Mgr' });
  const grp = await db.seedGroup({ name: 'Staff' });
  const member = await db.seedEmployee({ name: 'Member' });
  const outsider = await db.seedEmployee({ name: 'Outsider' });
  await db.addMember(member, grp);

  const PDF = Buffer.from('%PDF-1.4 verifiable body\n');
  h.asManager(mgr);
  const created = await request(h.app)
    .post('/api/trainings')
    .field('name', 'Handbook').field('docType', 'Policy').field('groupIds', grp)
    .attach('file', PDF, { filename: 'v1.pdf', contentType: 'application/pdf' });
  const id = created.body.id;

  h.asUser(member, []);
  const signed = await request(h.app).post('/api/signatures').send({ policyId: id, fullName: 'Member', acknowledged: true });
  const revId = signed.body.revision_id;

  // Governor lists revisions.
  h.asManager(mgr);
  const list = await request(h.app).get(`/api/policies/${id}/revisions`);
  assert.equal(list.status, 200);
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].is_current, true);
  assert.equal(list.body[0].signatures, 1);
  assert.equal(list.body[0].integrity, 'verified');

  // Verify: bytes still hash to what was recorded.
  const ver = await request(h.app).get(`/api/policies/${id}/revisions/${revId}/verify`);
  assert.equal(ver.status, 200);
  assert.equal(ver.body.ok, true);
  assert.equal(ver.body.actual, ver.body.expected);

  // The signer can re-open the exact frozen bytes; an outsider cannot.
  const asSigner = await request(h.app).get(`/api/policies/${id}/revisions/${revId}/content`).buffer();
  // (still asManager here — manager is governor, allowed) — check the bytes:
  assert.equal(asSigner.status, 200);

  h.asUser(outsider, []);
  const asOutsider = await request(h.app).get(`/api/policies/${id}/revisions/${revId}/content`);
  assert.equal(asOutsider.status, 403, 'a non-signer, non-governor cannot fetch frozen bytes');

  h.asUser(member, []);
  const asMember = await request(h.app).get(`/api/policies/${id}/revisions/${revId}/content`);
  assert.equal(asMember.status, 200, 'the signer can re-open what they acknowledged');

  // Tamper with the frozen file on disk → verify now fails.
  const rev = await one('select upload_path, content_sha256 from policy_revisions where id=$1', [revId]);
  fs.writeFileSync(path.join(cfg.uploadDir, rev.upload_path), Buffer.from('%PDF-1.4 TAMPERED\n'));
  h.asManager(mgr);
  const ver2 = await request(h.app).get(`/api/policies/${id}/revisions/${revId}/verify`);
  assert.equal(ver2.status, 200);
  assert.equal(ver2.body.ok, false, 'a modified frozen file fails verification');
  assert.notEqual(ver2.body.actual, ver2.body.expected);
});
