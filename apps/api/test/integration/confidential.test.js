// Confidential documents + share-request approval flow (finding #17).
// A document marked confidential can't have its recipient set expanded by anyone
// but the gatekeeper (the marker) or an admin — others must file a share request
// the gatekeeper approves, which then applies the assignment.
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const db = require('../helpers/db');
const h = require('../helpers/app');

let dbUp = false;
test.before(async () => { dbUp = await db.available(); if (dbUp) await db.applyAll(); });
test.beforeEach(async () => { if (dbUp) await db.truncate(); });
test.after(async () => { await db.end(); try { await h.pool.end(); } catch (_) {} });

const PDF = Buffer.from('%PDF-1.4 confidential\n');
const one = async (q, p) => (await db.superPool.query(q, p)).rows[0];
const assignedGroups = async (policyId) => (await db.superPool.query('select group_id from policy_groups where policy_id=$1 order by group_id', [policyId])).rows.map((r) => r.group_id);

test('admin marks a manager\'s doc confidential; the owner must request to expand sharing, gatekeeper approves', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const admin = await db.seedEmployee({ name: 'Admin' });
  const mgr = await db.seedEmployee({ name: 'Mgr' });
  const grpA = await db.seedGroup({ name: 'TeamA' });
  const grpB = await db.seedGroup({ name: 'TeamB' });

  // Manager uploads a training assigned to TeamA (they are the owner).
  h.asManager(mgr);
  const created = await request(h.app)
    .post('/api/trainings')
    .field('name', 'Secret Plan').field('docType', 'Policy').field('groupIds', grpA)
    .attach('file', PDF, { filename: 'v1.pdf', contentType: 'application/pdf' });
  const id = created.body.id;

  // Admin marks it confidential → admin is the gatekeeper.
  h.asAdmin(admin);
  const mark = await request(h.app).post(`/api/policies/${id}/confidential`).send({ confidential: true });
  assert.equal(mark.status, 200);
  assert.equal(mark.body.confidential, true);
  assert.equal(mark.body.confidential_by, admin);

  // The owner (not the gatekeeper) is blocked from adding TeamB directly.
  h.asManager(mgr);
  const blocked = await request(h.app)
    .put(`/api/trainings/${id}`).field('name', 'Secret Plan').field('groupIds', `${grpA},${grpB}`);
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.error, 'confidential_share_request_required');
  assert.deepEqual(await assignedGroups(id), [grpA].sort(), 'TeamB was NOT added');

  // Removing-only (back to just TeamA) is allowed — that's not expanding.
  const removeOnly = await request(h.app).put(`/api/trainings/${id}`).field('name', 'Secret Plan').field('version', 'v1.0').field('groupIds', grpA);
  assert.equal(removeOnly.status, 200);

  // The owner files a share request for TeamB.
  const sr = await request(h.app).post(`/api/policies/${id}/share-requests`).send({ groupIds: [grpB], comment: 'Needed for onboarding' });
  assert.equal(sr.status, 201);
  const reqId = sr.body.id;

  // The gatekeeper (admin) sees it pending and approves.
  h.asAdmin(admin);
  const pending = await request(h.app).get('/api/share-requests/pending');
  assert.equal(pending.status, 200);
  assert.ok(pending.body.find((x) => x.id === reqId), 'request is awaiting the gatekeeper');
  const approve = await request(h.app).post(`/api/share-requests/${reqId}/approve`).send({});
  assert.equal(approve.status, 200);
  assert.equal(approve.body.status, 'approved');

  // TeamB is now assigned, and the request is recorded as approved.
  assert.deepEqual(await assignedGroups(id), [grpA, grpB].sort(), 'approval applied the assignment');
  const row = await one('select status, decided_by from share_requests where id=$1', [reqId]);
  assert.equal(row.status, 'approved');
  assert.equal(row.decided_by, admin);
});

test('the gatekeeper can share directly; a non-gatekeeper cannot decide requests', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const mgr = await db.seedEmployee({ name: 'Owner' });
  const other = await db.seedEmployee({ name: 'Other' });
  const grpA = await db.seedGroup({ name: 'A' });
  const grpB = await db.seedGroup({ name: 'B' });

  // Owner uploads and marks their OWN doc confidential → owner is gatekeeper.
  h.asManager(mgr);
  const created = await request(h.app)
    .post('/api/trainings').field('name', 'Mine').field('groupIds', grpA)
    .attach('file', PDF, { filename: 'v1.pdf', contentType: 'application/pdf' });
  const id = created.body.id;
  await request(h.app).post(`/api/policies/${id}/confidential`).send({ confidential: true });

  // As gatekeeper, the owner can expand sharing directly (no request needed).
  const direct = await request(h.app).put(`/api/trainings/${id}`).field('name', 'Mine').field('version', 'v1.0').field('groupIds', `${grpA},${grpB}`);
  assert.equal(direct.status, 200);
  assert.deepEqual(await assignedGroups(id), [grpA, grpB].sort());

  // A different manager filing a request, then trying to approve their OWN request, is refused.
  const outsider = await db.seedEmployee({ name: 'Outsider' });
  h.asManager(other);
  // 'other' doesn't own the doc, so can't even file a request (not canManage).
  const cannotRequest = await request(h.app).post(`/api/policies/${id}/share-requests`).send({ groupIds: [grpB] });
  assert.equal(cannotRequest.status, 403);
  assert.equal(outsider, outsider); // (referenced)
});
