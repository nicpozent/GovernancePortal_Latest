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

test('concurrent final-step approvals are serialized (no stuck in_review)', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const s = await scenario();
  h.asAdmin(s.admin);
  // ONE step, rule 'all', two approvers → the step needs BOTH to approve.
  assert.equal((await request(h.app).put(`/api/policies/${s.pol}/approvers`)
    .send({ steps: [{ approverOids: [s.a1, s.a2], rule: 'all' }] })).status, 200);
  assert.equal((await request(h.app).post(`/api/policies/${s.pol}/submit`)).body.approval_state, 'in_review');

  // Both approvers decide AT THE SAME TIME (distinct per-request identities).
  // Pre-fix, both handlers read approvedOids=[] and neither flips the step to
  // approved → the policy is stuck in_review with two decisions. The row lock
  // serializes them so the second sees the first and the step completes.
  const [r1, r2] = await Promise.all([
    request(h.app).post(`/api/policies/${s.pol}/approve`).set('X-Test-Oid', s.a1),
    request(h.app).post(`/api/policies/${s.pol}/approve`).set('X-Test-Oid', s.a2),
  ]);
  assert.equal(r1.status, 200, 'first approval accepted');
  assert.equal(r2.status, 200, 'second approval accepted');

  h.asAdmin(s.admin);
  const st = (await request(h.app).get(`/api/policies/${s.pol}/approvals`)).body;
  assert.equal(st.approval_state, 'approved', 'both approvals recognized → approved, not stuck in_review');
  assert.equal(st.decisions.filter((d) => d.decision === 'approved').length, 2, 'both decisions recorded once each');
});

test('an approved/published version cannot be re-submitted without a new version', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const s = await scenario();
  h.asAdmin(s.admin);
  // Configure a single approver, run to approved, then publish (approved_version = v1).
  await request(h.app).put(`/api/policies/${s.pol}/approvers`).send({ approverOids: [s.a1] });
  await request(h.app).post(`/api/policies/${s.pol}/submit`);
  h.asUser(s.a1, []);
  assert.equal((await request(h.app).post(`/api/policies/${s.pol}/approve`)).body.approval_state, 'approved');
  h.asAdmin(s.admin);
  assert.equal((await request(h.app).post(`/api/policies/${s.pol}/publish`)).body.approval_state, 'published');

  // Re-submitting the SAME (already-approved) version is refused.
  const blocked = await request(h.app).post(`/api/policies/${s.pol}/submit`);
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.error, 'already_approved');

  // Bumping to a new version re-opens approval.
  await h.pool.query("update policies set version='v2' where id=$1", [s.pol]);
  assert.equal((await request(h.app).post(`/api/policies/${s.pol}/submit`)).body.approval_state, 'in_review');
});

test('bumping a workflow-governed policy to a new version re-gates it (re-approval required)', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const s = await scenario();
  h.asAdmin(s.admin);
  await request(h.app).put(`/api/policies/${s.pol}/approvers`).send({ approverOids: [s.a1] });
  await request(h.app).post(`/api/policies/${s.pol}/submit`);
  h.asUser(s.a1, []);
  await request(h.app).post(`/api/policies/${s.pol}/approve`);
  h.asAdmin(s.admin);
  await request(h.app).post(`/api/policies/${s.pol}/publish`);
  // Published → the member sees it.
  h.asUser(s.member, []);
  assert.equal(await seesPolicy(s.pol), true);
  // Admin edits it to a new version → it must be re-approved before it is visible.
  h.asAdmin(s.admin);
  const upd = await request(h.app).put(`/api/policies/${s.pol}`)
    .send({ name: 'Access Policy', docType: 'Policy', version: 'v2', sharepointUrl: 'https://sp/x' });
  assert.equal(upd.body.approval_state, 'draft', 'new version drops back to draft');
  assert.equal(upd.body.approvalReset, true);
  // Hidden from the member until re-approved + re-published.
  h.asUser(s.member, []);
  assert.equal(await seesPolicy(s.pol), false, 'new version is hidden pending re-approval');
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

// ── Phase 2b: group approvers (all / any / quorum) ──

test("group step 'any': a single approval clears the step", async (t) => {
  if (!dbUp) return t.skip('no test database');
  const s = await scenario();
  h.asAdmin(s.admin);
  const set = await request(h.app).put(`/api/policies/${s.pol}/approvers`)
    .send({ steps: [{ approverOids: [s.a1, s.a2], rule: 'any' }] });
  assert.equal(set.body.steps, 1);
  assert.equal(set.body.approvers, 2);
  await request(h.app).post(`/api/policies/${s.pol}/submit`);
  // Both a1 and a2 are pending for this step until one acts.
  h.asUser(s.a2, []);
  assert.equal((await request(h.app).get('/api/approvals/pending')).body.length, 1);
  // One approval is enough → approved.
  assert.equal((await request(h.app).post(`/api/policies/${s.pol}/approve`)).body.approval_state, 'approved');
  // The other member is no longer pending.
  h.asUser(s.a1, []);
  assert.equal((await request(h.app).get('/api/approvals/pending')).body.length, 0);
});

test("group step 'all': every approver must approve; double-approve is blocked", async (t) => {
  if (!dbUp) return t.skip('no test database');
  const s = await scenario();
  h.asAdmin(s.admin);
  await request(h.app).put(`/api/policies/${s.pol}/approvers`).send({ steps: [{ approverOids: [s.a1, s.a2], rule: 'all' }] });
  await request(h.app).post(`/api/policies/${s.pol}/submit`);
  h.asUser(s.a1, []);
  assert.equal((await request(h.app).post(`/api/policies/${s.pol}/approve`)).body.approval_state, 'in_review', 'one of two → still in review');
  // a1 approving again is rejected.
  assert.equal((await request(h.app).post(`/api/policies/${s.pol}/approve`)).status, 409);
  h.asUser(s.a2, []);
  assert.equal((await request(h.app).post(`/api/policies/${s.pol}/approve`)).body.approval_state, 'approved', 'both → approved');
});

test("group step 'quorum': N of M approvals clear the step", async (t) => {
  if (!dbUp) return t.skip('no test database');
  const s = await scenario();
  const a3 = await db.seedEmployee({ name: 'CFO' });
  h.asAdmin(s.admin);
  await request(h.app).put(`/api/policies/${s.pol}/approvers`).send({ steps: [{ approverOids: [s.a1, s.a2, a3], rule: 'quorum', required: 2 }] });
  await request(h.app).post(`/api/policies/${s.pol}/submit`);
  h.asUser(s.a1, []);
  assert.equal((await request(h.app).post(`/api/policies/${s.pol}/approve`)).body.approval_state, 'in_review', '1 of 2 quorum');
  h.asUser(s.a2, []);
  assert.equal((await request(h.app).post(`/api/policies/${s.pol}/approve`)).body.approval_state, 'approved', '2 of 2 quorum → approved');
});

test('mixed steps: an any-group then an all-group, in order', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const s = await scenario();
  const a3 = await db.seedEmployee({ name: 'CFO' });
  h.asAdmin(s.admin);
  await request(h.app).put(`/api/policies/${s.pol}/approvers`).send({
    steps: [
      { approverOids: [s.a1, s.a2], rule: 'any' },
      { approverOids: [s.a2, a3], rule: 'all' },
    ],
  });
  await request(h.app).post(`/api/policies/${s.pol}/submit`);
  // Step 2 members cannot act before step 1 clears.
  h.asUser(a3, []);
  assert.equal((await request(h.app).post(`/api/policies/${s.pol}/approve`)).body.error, 'not_pending_approver');
  // Clear step 1 with a1 (any).
  h.asUser(s.a1, []);
  assert.equal((await request(h.app).post(`/api/policies/${s.pol}/approve`)).body.approval_state, 'in_review');
  // Step 2 is 'all' (a2 + a3).
  h.asUser(a3, []);
  assert.equal((await request(h.app).post(`/api/policies/${s.pol}/approve`)).body.approval_state, 'in_review');
  h.asUser(s.a2, []);
  assert.equal((await request(h.app).post(`/api/policies/${s.pol}/approve`)).body.approval_state, 'approved');
  // The chain reports two steps with the right rules.
  h.asAdmin(s.admin);
  const st = await request(h.app).get(`/api/policies/${s.pol}/approvals`);
  assert.equal(st.body.steps.length, 2);
  assert.equal(st.body.steps[0].rule, 'any');
  assert.equal(st.body.steps[1].rule, 'all');
});
