// Integration tests for directory-group approvers (Phase 2d, ADR-120):
// a step can target a GROUP; at submit the group is expanded to its current
// members and FROZEN for the run (snapshot-at-submit), so later membership
// changes never disturb an in-flight run.
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const db = require('../helpers/db');
const h = require('../helpers/app');

let dbUp = false;
test.before(async () => { dbUp = await db.available(); if (dbUp) await db.applyAll(); });
test.beforeEach(async () => { if (dbUp) await db.truncate(); });
test.after(async () => { await db.end(); try { await h.pool.end(); } catch (_) {} });

// Admin owner, a group with two members, and a policy owned by the admin.
async function scenario() {
  const admin = await db.seedEmployee({ name: 'Admin' });
  const m1 = await db.seedEmployee({ name: 'Sec One' });
  const m2 = await db.seedEmployee({ name: 'Sec Two' });
  const grp = await db.seedGroup({ name: 'Security' });
  await db.addMember(m1, grp);
  await db.addMember(m2, grp);
  const pol = await db.seedPolicy({ name: 'Access Policy', version: 'v1', ownerOid: admin });
  return { admin, m1, m2, grp, pol };
}
const setSteps = (pol, steps) => request(h.app).put(`/api/policies/${pol}/approvers`).send({ steps });

test("group step 'all': every current member must approve", async (t) => {
  if (!dbUp) return t.skip('no test database');
  const s = await scenario();
  h.asAdmin(s.admin);
  const set = await setSteps(s.pol, [{ groupIds: [s.grp], rule: 'all' }]);
  assert.equal(set.body.groups, 1);
  assert.equal(set.body.approvers, 0, 'no named people — only a group');
  await request(h.app).post(`/api/policies/${s.pol}/submit`);
  // The group expanded to both members; the chain now shows two people + the group chip.
  const st = await request(h.app).get(`/api/policies/${s.pol}/approvals`);
  assert.equal(st.body.steps[0].approvers.length, 2);
  assert.equal(st.body.steps[0].groups[0].name, 'Security');
  h.asUser(s.m1, []);
  assert.equal((await request(h.app).post(`/api/policies/${s.pol}/approve`)).body.approval_state, 'in_review');
  h.asUser(s.m2, []);
  assert.equal((await request(h.app).post(`/api/policies/${s.pol}/approve`)).body.approval_state, 'approved');
});

test("group step 'any': a single member clears the step", async (t) => {
  if (!dbUp) return t.skip('no test database');
  const s = await scenario();
  h.asAdmin(s.admin);
  await setSteps(s.pol, [{ groupIds: [s.grp], rule: 'any' }]);
  await request(h.app).post(`/api/policies/${s.pol}/submit`);
  h.asUser(s.m2, []);
  assert.equal((await request(h.app).get('/api/approvals/pending')).body.length, 1, 'a group member is pending');
  assert.equal((await request(h.app).post(`/api/policies/${s.pol}/approve`)).body.approval_state, 'approved');
});

test('snapshot-at-submit: adding a member AFTER submit does not change the run', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const s = await scenario();
  const m3 = await db.seedEmployee({ name: 'Sec Three' });
  h.asAdmin(s.admin);
  await setSteps(s.pol, [{ groupIds: [s.grp], rule: 'all' }]);
  await request(h.app).post(`/api/policies/${s.pol}/submit`);      // freezes {m1, m2}
  await db.addMember(m3, s.grp);                                    // m3 joins the group mid-review
  // The frozen two are still the whole requirement — m3 is not required.
  h.asUser(m3, []);
  assert.equal((await request(h.app).post(`/api/policies/${s.pol}/approve`)).body.error, 'not_pending_approver');
  h.asUser(s.m1, []);
  await request(h.app).post(`/api/policies/${s.pol}/approve`);
  h.asUser(s.m2, []);
  assert.equal((await request(h.app).post(`/api/policies/${s.pol}/approve`)).body.approval_state, 'approved');
});

test('re-submitting after changes re-resolves the group (fresh snapshot)', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const s = await scenario();
  const m3 = await db.seedEmployee({ name: 'Sec Three' });
  h.asAdmin(s.admin);
  await setSteps(s.pol, [{ groupIds: [s.grp], rule: 'all' }]);
  await request(h.app).post(`/api/policies/${s.pol}/submit`);
  h.asUser(s.m1, []);
  await request(h.app).post(`/api/policies/${s.pol}/request-changes`).send({ comment: 'Rework.' });
  // Owner adds a member, then resubmits → the new run includes m3.
  await db.addMember(m3, s.grp);
  h.asAdmin(s.admin);
  await request(h.app).post(`/api/policies/${s.pol}/submit`);
  const st = await request(h.app).get(`/api/policies/${s.pol}/approvals`);
  assert.equal(st.body.steps[0].approvers.length, 3, 'fresh snapshot picked up the new member');
});

test('empty group cannot be submitted', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const s = await scenario();
  const empty = await db.seedGroup({ name: 'Ghosts' });
  h.asAdmin(s.admin);
  await setSteps(s.pol, [{ groupIds: [empty], rule: 'all' }]);
  const res = await request(h.app).post(`/api/policies/${s.pol}/submit`);
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'no_approvers');
});

test('a named person who is also a group member is counted once', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const s = await scenario();
  h.asAdmin(s.admin);
  // Step names m1 directly AND includes the group (which also contains m1, m2).
  await setSteps(s.pol, [{ approverOids: [s.m1], groupIds: [s.grp], rule: 'all' }]);
  await request(h.app).post(`/api/policies/${s.pol}/submit`);
  const st = await request(h.app).get(`/api/policies/${s.pol}/approvals`);
  assert.equal(st.body.steps[0].approvers.length, 2, 'm1 appears once, not twice');
});
