// Integration tests for reusable approval workflow templates (Phase 2c, ADR-120):
// admin-only CRUD, applying a template copies its steps onto a policy, and a
// later edit to the template does NOT disturb an already-configured policy.
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const db = require('../helpers/db');
const h = require('../helpers/app');

let dbUp = false;
test.before(async () => { dbUp = await db.available(); if (dbUp) await db.applyAll(); });
test.beforeEach(async () => { if (dbUp) await db.truncate(); });
test.after(async () => { await db.end(); try { await h.pool.end(); } catch (_) {} });

async function scenario() {
  const admin = await db.seedEmployee({ name: 'Admin' });
  const a1 = await db.seedEmployee({ name: 'Infra Manager' });
  const a2 = await db.seedEmployee({ name: 'CTO' });
  const a3 = await db.seedEmployee({ name: 'CISO' });
  const pol = await db.seedPolicy({ name: 'Access Policy', version: 'v1', ownerOid: admin });
  return { admin, a1, a2, a3, pol };
}

test('template CRUD is admin-only', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const s = await scenario();
  h.asUser(s.a1, []);
  assert.equal((await request(h.app).get('/api/approval-workflows')).status, 403);
  assert.equal((await request(h.app).post('/api/approval-workflows').send({ name: 'X' })).status, 403);
});

test('create a template with grouped steps and read it back', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const s = await scenario();
  h.asAdmin(s.admin);
  const create = await request(h.app).post('/api/approval-workflows').send({
    name: 'Standard sign-off', description: 'Infra → any exec',
    steps: [
      { approverOids: [s.a1], rule: 'all' },
      { approverOids: [s.a2, s.a3], rule: 'any' },
    ],
  });
  assert.equal(create.status, 201);
  assert.equal(create.body.steps.length, 2);
  assert.equal(create.body.steps[1].rule, 'any');
  assert.equal(create.body.steps[1].approvers.length, 2);
  // Listed for admins.
  const list = await request(h.app).get('/api/approval-workflows');
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].name, 'Standard sign-off');
});

test('applying a template configures the policy and drives a real run', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const s = await scenario();
  h.asAdmin(s.admin);
  const wf = (await request(h.app).post('/api/approval-workflows').send({
    name: 'Two-step', steps: [{ approverOids: [s.a1], rule: 'all' }, { approverOids: [s.a2], rule: 'all' }],
  })).body;
  const apply = await request(h.app).post(`/api/policies/${s.pol}/apply-workflow`).send({ workflowId: wf.id });
  assert.equal(apply.status, 200);
  assert.equal(apply.body.steps, 2);
  // The policy now carries the copied chain and can run it.
  const st = await request(h.app).get(`/api/policies/${s.pol}/approvals`);
  assert.equal(st.body.steps.length, 2);
  await request(h.app).post(`/api/policies/${s.pol}/submit`);
  h.asUser(s.a1, []);
  assert.equal((await request(h.app).post(`/api/policies/${s.pol}/approve`)).body.approval_state, 'in_review');
  h.asUser(s.a2, []);
  assert.equal((await request(h.app).post(`/api/policies/${s.pol}/approve`)).body.approval_state, 'approved');
});

test('editing a template does not disturb an already-applied policy (snapshot)', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const s = await scenario();
  h.asAdmin(s.admin);
  const wf = (await request(h.app).post('/api/approval-workflows').send({
    name: 'One-step', steps: [{ approverOids: [s.a1], rule: 'all' }],
  })).body;
  await request(h.app).post(`/api/policies/${s.pol}/apply-workflow`).send({ workflowId: wf.id });
  // Rewrite the template to a different, longer chain.
  await request(h.app).put(`/api/approval-workflows/${wf.id}`).send({
    name: 'One-step', steps: [{ approverOids: [s.a2, s.a3], rule: 'all' }],
  });
  // The policy still reflects the ORIGINAL applied chain, not the edit.
  const st = await request(h.app).get(`/api/policies/${s.pol}/approvals`);
  assert.equal(st.body.steps.length, 1);
  assert.equal(st.body.steps[0].approvers.length, 1);
  assert.equal(st.body.steps[0].approvers[0].oid, s.a1);
});

test('a template cannot be applied while a policy is in review', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const s = await scenario();
  h.asAdmin(s.admin);
  const wf = (await request(h.app).post('/api/approval-workflows').send({
    name: 'One-step', steps: [{ approverOids: [s.a1], rule: 'all' }],
  })).body;
  await request(h.app).post(`/api/policies/${s.pol}/apply-workflow`).send({ workflowId: wf.id });
  await request(h.app).post(`/api/policies/${s.pol}/submit`);
  const res = await request(h.app).post(`/api/policies/${s.pol}/apply-workflow`).send({ workflowId: wf.id });
  assert.equal(res.status, 409);
  assert.equal(res.body.error, 'bad_state');
});

test('deleting a template leaves applied policies intact', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const s = await scenario();
  h.asAdmin(s.admin);
  const wf = (await request(h.app).post('/api/approval-workflows').send({
    name: 'One-step', steps: [{ approverOids: [s.a1], rule: 'all' }],
  })).body;
  await request(h.app).post(`/api/policies/${s.pol}/apply-workflow`).send({ workflowId: wf.id });
  assert.equal((await request(h.app).delete(`/api/approval-workflows/${wf.id}`)).status, 200);
  assert.equal((await request(h.app).get('/api/approval-workflows')).body.length, 0);
  // The applied chain survives.
  const st = await request(h.app).get(`/api/policies/${s.pol}/approvals`);
  assert.equal(st.body.steps.length, 1);
});
