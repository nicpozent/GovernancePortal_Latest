// ============================================================
//  Policy approval workflow — Phase 1 MVP (ADR-120).
//  Sequential, one approver per step. Approval is per-version and per-run
//  (a run starts at submit; decisions before submitted_at belong to an earlier
//  run, so a changes-requested → resubmit cycle restarts the chain cleanly).
//  Decisions are append-only (policy_approvals; REVOKE update/delete).
// ============================================================
const { pool } = require('../db');
const { isAdmin, audit } = require('../authz');

// Owner or admin may drive the workflow (submit/withdraw/publish/config).
const canGovern = (req, p) => isAdmin(req) || (p.owner_oid && p.owner_oid === req.user.oid);

// Load the approval context for a policy: ordered approvers, the decision log for
// the current version, how many approvals the CURRENT run has, and whose turn it is.
async function ctx(policyId) {
  const p = (await pool.query(
    'select id, name, version, owner_oid, approval_state, approved_version, submitted_at from policies where id=$1',
    [policyId])).rows[0];
  if (!p) return null;
  const approvers = (await pool.query(
    `select pa.position, pa.approver_oid, e.display_name from policy_approvers pa
       left join employees e on e.oid = pa.approver_oid
      where pa.policy_id=$1 order by pa.position`, [policyId])).rows;
  const decisions = (await pool.query(
    `select step_position, approver_oid, decision, comment, decided_at from policy_approvals
      where policy_id=$1 and policy_version=$2 order by decided_at`, [policyId, p.version])).rows;
  // Approvals belonging to the current run only (since the last submit).
  const runApproved = decisions.filter((d) =>
    d.decision === 'approved' && (!p.submitted_at || new Date(d.decided_at) >= new Date(p.submitted_at))).length;
  const currentStep = p.approval_state === 'in_review' ? (approvers[runApproved] || null) : null;
  return { p, approvers, decisions, runApproved, currentStep };
}

module.exports = (r) => {
  // ── configure the ordered approver list (owner/admin) ──
  r.put('/policies/:id/approvers', async (req, res) => {
    const c = await ctx(req.params.id);
    if (!c) return res.status(404).json({ error: 'not_found' });
    if (!canGovern(req, c.p)) return res.status(403).json({ error: 'forbidden' });
    if (c.p.approval_state === 'in_review') return res.status(409).json({ error: 'bad_state', detail: 'Withdraw the review before changing approvers.' });
    const oids = Array.isArray(req.body && req.body.approverOids) ? req.body.approverOids : [];
    await pool.query('delete from policy_approvers where policy_id=$1', [c.p.id]);
    let pos = 1;
    for (const oid of oids) await pool.query('insert into policy_approvers (policy_id, position, approver_oid) values ($1,$2,$3)', [c.p.id, pos++, oid]);
    await audit(req, 'policy.approvers.set', c.p.name, { id: c.p.id, count: oids.length });
    res.json({ ok: true, count: oids.length });
  });

  // ── submit for approval (owner/admin): -> in_review ──
  r.post('/policies/:id/submit', async (req, res) => {
    const c = await ctx(req.params.id);
    if (!c) return res.status(404).json({ error: 'not_found' });
    if (!canGovern(req, c.p)) return res.status(403).json({ error: 'forbidden' });
    if (!c.approvers.length) return res.status(400).json({ error: 'no_approvers', detail: 'Add at least one approver first.' });
    if (c.p.approval_state === 'in_review') return res.status(409).json({ error: 'bad_state', detail: 'Already in review.' });
    await pool.query(
      `update policies set approval_state='in_review', approved_externally=false, approved_version=null,
         submitted_at=now(), submitted_by=$2, updated_at=now() where id=$1`, [c.p.id, req.user.oid]);
    await audit(req, 'policy.approval.submit', c.p.name, { id: c.p.id, version: c.p.version });
    res.json({ ok: true, approval_state: 'in_review' });
  });

  // ── a step decision (current approver, or admin override) ──
  async function decide(req, res, decision) {
    const c = await ctx(req.params.id);
    if (!c) return res.status(404).json({ error: 'not_found' });
    if (c.p.approval_state !== 'in_review' || !c.currentStep) return res.status(409).json({ error: 'bad_state', detail: 'This policy is not awaiting your approval.' });
    if (c.currentStep.approver_oid !== req.user.oid && !isAdmin(req)) return res.status(403).json({ error: 'not_pending_approver' });
    const comment = ((req.body && req.body.comment) || '').trim();
    if ((decision === 'rejected' || decision === 'changes_requested') && !comment) {
      return res.status(400).json({ error: 'comment_required', detail: 'A comment is required to reject or request changes.' });
    }
    await pool.query(
      'insert into policy_approvals (policy_id, policy_version, step_position, approver_oid, decision, comment) values ($1,$2,$3,$4,$5,$6)',
      [c.p.id, c.p.version, c.currentStep.position, req.user.oid, decision, comment || null]);
    let state = 'in_review';
    if (decision === 'rejected') state = 'rejected';
    else if (decision === 'changes_requested') state = 'changes_requested';
    else if (c.runApproved + 1 >= c.approvers.length) state = 'approved';
    if (state === 'approved') {
      await pool.query("update policies set approval_state='approved', approved_version=$2, updated_at=now() where id=$1", [c.p.id, c.p.version]);
    } else if (state !== 'in_review') {
      await pool.query('update policies set approval_state=$2, updated_at=now() where id=$1', [c.p.id, state]);
    }
    await audit(req, 'policy.approval.' + decision, c.p.name, { id: c.p.id, version: c.p.version, step: c.currentStep.position });
    res.json({ ok: true, approval_state: state });
  }
  r.post('/policies/:id/approve', (req, res) => decide(req, res, 'approved'));
  r.post('/policies/:id/reject', (req, res) => decide(req, res, 'rejected'));
  r.post('/policies/:id/request-changes', (req, res) => decide(req, res, 'changes_requested'));

  // ── withdraw (owner/admin): in_review -> draft ──
  r.post('/policies/:id/withdraw', async (req, res) => {
    const c = await ctx(req.params.id);
    if (!c) return res.status(404).json({ error: 'not_found' });
    if (!canGovern(req, c.p)) return res.status(403).json({ error: 'forbidden' });
    if (c.p.approval_state !== 'in_review') return res.status(409).json({ error: 'bad_state' });
    await pool.query("update policies set approval_state='draft', updated_at=now() where id=$1", [c.p.id]);
    await audit(req, 'policy.approval.withdraw', c.p.name, { id: c.p.id });
    res.json({ ok: true, approval_state: 'draft' });
  });

  // ── publish (owner/admin): approved -> published ──
  r.post('/policies/:id/publish', async (req, res) => {
    const c = await ctx(req.params.id);
    if (!c) return res.status(404).json({ error: 'not_found' });
    if (!canGovern(req, c.p)) return res.status(403).json({ error: 'forbidden' });
    if (c.p.approval_state !== 'approved') return res.status(409).json({ error: 'not_approved', detail: 'Only an approved policy can be published.' });
    await pool.query("update policies set approval_state='published', updated_at=now() where id=$1", [c.p.id]);
    await audit(req, 'policy.approval.publish', c.p.name, { id: c.p.id, version: c.p.version });
    res.json({ ok: true, approval_state: 'published' });
  });

  // ── admin escape hatch: mark approved externally (e.g. signed off in SharePoint) ──
  r.post('/policies/:id/approve-externally', async (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });
    const upd = (await pool.query(
      "update policies set approved_externally=true, approval_state='published', updated_at=now() where id=$1 returning id, name", [req.params.id])).rows[0];
    if (!upd) return res.status(404).json({ error: 'not_found' });
    await audit(req, 'policy.approval.external', upd.name, { id: upd.id });
    res.json({ ok: true, approval_state: 'published' });
  });

  // ── status + decision log for one policy ──
  r.get('/policies/:id/approvals', async (req, res) => {
    const c = await ctx(req.params.id);
    if (!c) return res.status(404).json({ error: 'not_found' });
    res.json({
      approval_state: c.p.approval_state,
      approved_version: c.p.approved_version,
      approvers: c.approvers.map((a) => ({ position: a.position, oid: a.approver_oid, name: a.display_name })),
      currentStep: c.currentStep ? { position: c.currentStep.position, oid: c.currentStep.approver_oid } : null,
      decisions: c.decisions,
      canAct: !!(c.currentStep && (c.currentStep.approver_oid === req.user.oid || isAdmin(req))),
      canGovern: canGovern(req, c.p),
    });
  });

  // ── "my approvals": policies awaiting the caller's decision ──
  r.get('/approvals/pending', async (req, res) => {
    const rows = (await pool.query(
      `select p.id, p.name, p.version, p.submitted_at,
              (select count(*) from policy_approvals a
                 where a.policy_id=p.id and a.policy_version=p.version and a.decision='approved'
                   and (p.submitted_at is null or a.decided_at >= p.submitted_at))::int as approved_count
         from policies p where p.approval_state='in_review' and p.archived_at is null`)).rows;
    const mine = [];
    for (const p of rows) {
      const cur = (await pool.query('select approver_oid from policy_approvers where policy_id=$1 and position=$2', [p.id, p.approved_count + 1])).rows[0];
      if (cur && cur.approver_oid === req.user.oid) mine.push({ id: p.id, name: p.name, version: p.version, submitted_at: p.submitted_at });
    }
    res.json(mine);
  });
};
