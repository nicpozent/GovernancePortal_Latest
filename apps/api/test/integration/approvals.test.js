// Integration tests for the policy approval workflow (Phase 1 MVP, ADR-120):
// the sequential state machine, the publish gate (employees can't see a policy
// under review), and authorization (only the pending approver can act).
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const db = require('../helpers/db');
const h = require('../helpers/app');

let dbUp = false;
test.before(async () => { dbUp = await db.available(); if (dbUp) await db.applyAll(); });
test.beforeEach(async () => { if (dbUp) await db.truncate(); });
test.after(async () => { await db.end(); try { await h.pool.end(); } catch (_) {} });

// Seed an admin, two approvers, a member in a group, and a policy assigned to it.
async function scenario() {
  const admin = await db.seedEmployee({ name: 'Admin' });
  const a1 = await db.seedEmployee({ name: 'Infra Manager' });
  const a2 = await db.seedEmployee({ name: 'CTO' });
  const member = await db.seedEmployee({ name: 'Member' });
  const grp = await db.seedGroup({ kind: 'Local' });
  await db.addMember(member, grp);
  const pol = await db.seedPolicy({ name: 'Access Policy', version: 'v1', ownerOid: admin, groupIds: [grp] });
  return { admin, a1, a2, member, grp, pol };
}
const seesPolicy = async (id) => (await request(h.app).get('/api/policies')).body.some((p) => p.id === id);

test('submit requires at least one approver', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const s = await scenario();
  h.asAdmin(s.admin);
  const res = await request(h.app).post(`/api/policies/${s.pol}/submit`);
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'no_approvers');
});

test('full chain: configure → submit gates visibility → sequential approve → publish restores it', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const s = await scenario();

  // Default state is published/external → the member sees it.
  h.asUser(s.member, []);
  assert.equal(await seesPolicy(s.pol), true, 'published policy is visible to a member');

  // Admin configures approvers and submits.
  h.asAdmin(s.admin);
  assert.equal((await request(h.app).put(`/api/policies/${s.pol}/approvers`).send({ approverOids: [s.a1, s.a2] })).status, 200);
  assert.equal((await request(h.app).post(`/api/policies/${s.pol}/submit`)).body.approval_state, 'in_review');

  // Now under review → the member can no longer see or open it (publish gate).
  h.asUser(s.member, []);
  assert.equal(await seesPolicy(s.pol), false, 'in-review policy is hidden from members');
  assert.equal((await request(h.app).get(`/api/policies/${s.pol}/document`)).status, 403);

  // Out-of-turn approver is rejected; the first approver goes first.
  h.asUser(s.a2, []);
  assert.equal((await request(h.app).post(`/api/policies/${s.pol}/approve`)).body.error, 'not_pending_approver');
  h.asUser(s.a1, []);
  assert.equal((await request(h.app).post(`/api/policies/${s.pol}/approve`)).body.approval_state, 'in_review', 'still one step to go');
  h.asUser(s.a2, []);
  assert.equal((await request(h.app).post(`/api/policies/${s.pol}/approve`)).body.approval_state, 'approved', 'last step → approved');

  // Approved but not yet published → still hidden; publish restores visibility.
  h.asUser(s.member, []);
  assert.equal(await seesPolicy(s.pol), false, 'approved-not-published is still gated');
  h.asAdmin(s.admin);
  assert.equal((await request(h.app).post(`/api/policies/${s.pol}/publish`)).body.approval_state, 'published');
  h.asUser(s.member, []);
  assert.equal(await seesPolicy(s.pol), true, 'published again → member sees it');
});

test('request-changes needs a comment and moves to changes_requested', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const s = await scenario();
  h.asAdmin(s.admin);
  await request(h.app).put(`/api/policies/${s.pol}/approvers`).send({ approverOids: [s.a1] });
  await request(h.app).post(`/api/policies/${s.pol}/submit`);
  h.asUser(s.a1, []);
  assert.equal((await request(h.app).post(`/api/policies/${s.pol}/request-changes`)).body.error, 'comment_required');
  const ok = await request(h.app).post(`/api/policies/${s.pol}/request-changes`).send({ comment: 'Tighten section 3.' });
  assert.equal(ok.body.approval_state, 'changes_requested');
  // The decision is recorded in the append-only log.
  const st = await request(h.app).get(`/api/policies/${s.pol}/approvals`);
  assert.equal(st.body.decisions.length, 1);
  assert.equal(st.body.decisions[0].comment, 'Tighten section 3.');
});

test('reject moves to rejected; a non-owner cannot submit', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const s = await scenario();
  h.asAdmin(s.admin);
  await request(h.app).put(`/api/policies/${s.pol}/approvers`).send({ approverOids: [s.a1] });
  await request(h.app).post(`/api/policies/${s.pol}/submit`);
  h.asUser(s.a1, []);
  assert.equal((await request(h.app).post(`/api/policies/${s.pol}/reject`).send({ comment: 'Not acceptable.' })).body.approval_state, 'rejected');
  // A random user (not owner/admin) cannot drive the workflow.
  h.asUser(s.member, []);
  assert.equal((await request(h.app).post(`/api/policies/${s.pol}/submit`)).status, 403);
});

test('publish is blocked unless approved; admin can approve externally', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const s = await scenario();
  h.asAdmin(s.admin);
  await request(h.app).put(`/api/policies/${s.pol}/approvers`).send({ approverOids: [s.a1] });
  await request(h.app).post(`/api/policies/${s.pol}/submit`);
  // Not approved yet → publish rejected.
  assert.equal((await request(h.app).post(`/api/policies/${s.pol}/publish`)).body.error, 'not_approved');
  // Admin escape hatch marks it externally approved → published.
  const ext = await request(h.app).post(`/api/policies/${s.pol}/approve-externally`);
  assert.equal(ext.body.approval_state, 'published');
  h.asUser(s.member, []);
  assert.equal(await seesPolicy(s.pol), true);
});

test('pending queue lists policies awaiting the caller', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const s = await scenario();
  h.asAdmin(s.admin);
  await request(h.app).put(`/api/policies/${s.pol}/approvers`).send({ approverOids: [s.a1, s.a2] });
  await request(h.app).post(`/api/policies/${s.pol}/submit`);
  // a1 is first in line; a2 is not yet.
  h.asUser(s.a1, []);
  assert.equal((await request(h.app).get('/api/approvals/pending')).body.length, 1);
  h.asUser(s.a2, []);
  assert.equal((await request(h.app).get('/api/approvals/pending')).body.length, 0);
});
