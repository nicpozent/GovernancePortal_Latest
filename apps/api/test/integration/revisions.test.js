// Regression net for immutable content revisions (ADR-121 / finding #4).
// Verifies that acknowledging an uploaded document freezes a content-addressed,
// verified revision and binds the signature to it; that replacing the file
// invalidates the cache and freezes a NEW revision on the next acknowledgement;
// and that the earlier signature keeps pointing at its ORIGINAL frozen bytes
// (immutable — never carried forward, never overwritten).
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const request = require('supertest');
const db = require('../helpers/db');
const h = require('../helpers/app');

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
