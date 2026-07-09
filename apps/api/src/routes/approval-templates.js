// ============================================================
//  Policy approval workflow — Phase 2c: reusable templates (ADR-120).
//  Admins author named approval chains; owners/admins APPLY a template to a
//  policy, which COPIES its steps into policy_approvers / policy_approval_steps
//  (the Phase 2b per-policy config). The copy is the policy's own snapshot, so
//  later edits to the template never disturb an already-configured policy.
//  Workflow ids are bigints, so these routes use :wfId (not the UUID :id param).
// ============================================================
const { pool } = require('../db');
const { isAdmin, audit } = require('../authz');

const requireAdmin = (req, res, next) => (isAdmin(req) ? next() : res.status(403).json({ error: 'forbidden' }));

// Normalize a { steps:[{ approverOids, groupIds, rule, required }] } body.
function normalizeSteps(body) {
  const raw = Array.isArray(body && body.steps) ? body.steps : [];
  return raw.map((s) => ({
    approverOids: [...new Set((Array.isArray(s.approverOids) ? s.approverOids : []).filter(Boolean))],
    groupIds: [...new Set((Array.isArray(s.groupIds) ? s.groupIds : []).filter(Boolean))],
    rule: ['all', 'any', 'quorum'].includes(s.rule) ? s.rule : 'all',
    required: Number.isInteger(s.required) ? s.required : null,
  })).filter((s) => s.approverOids.length || s.groupIds.length);
}
const quorumOf = (s) => (s.rule === 'quorum' ? Math.max(s.required || 1, 1) : null);

// Persist a template's steps (delete-then-insert; cascades approvers + groups).
async function writeWorkflowSteps(wfId, steps) {
  await pool.query('delete from approval_workflow_steps where workflow_id=$1', [wfId]);
  let pos = 1;
  for (const s of steps) {
    await pool.query('insert into approval_workflow_steps (workflow_id, position, rule, required) values ($1,$2,$3,$4)', [wfId, pos, s.rule, quorumOf(s)]);
    for (const oid of s.approverOids) {
      await pool.query('insert into approval_workflow_step_approvers (workflow_id, position, approver_oid) values ($1,$2,$3)', [wfId, pos, oid]);
    }
    for (const gid of s.groupIds) {
      await pool.query('insert into approval_workflow_step_groups (workflow_id, position, group_id) values ($1,$2,$3)', [wfId, pos, gid]);
    }
    pos++;
  }
}

// Load a template with its ordered steps + approvers + groups.
async function loadWorkflow(id) {
  const w = (await pool.query('select id, name, description, active, created_at, updated_at from approval_workflows where id=$1', [id])).rows[0];
  if (!w) return null;
  const stepRows = (await pool.query('select position, rule, required from approval_workflow_steps where workflow_id=$1 order by position', [id])).rows;
  const apprRows = (await pool.query(
    `select sa.position, sa.approver_oid, e.display_name from approval_workflow_step_approvers sa
       left join employees e on e.oid = sa.approver_oid where sa.workflow_id=$1 order by sa.position, sa.approver_oid`, [id])).rows;
  const grpRows = (await pool.query(
    `select sg.position, sg.group_id, g.name from approval_workflow_step_groups sg
       left join groups g on g.id = sg.group_id where sg.workflow_id=$1 order by sg.position, sg.group_id`, [id])).rows;
  const byPos = new Map(), grpByPos = new Map();
  for (const a of apprRows) {
    if (!byPos.has(a.position)) byPos.set(a.position, []);
    byPos.get(a.position).push({ oid: a.approver_oid, name: a.display_name });
  }
  for (const g of grpRows) {
    if (!grpByPos.has(g.position)) grpByPos.set(g.position, []);
    grpByPos.get(g.position).push({ id: g.group_id, name: g.name });
  }
  w.steps = stepRows.map((s) => ({ position: s.position, rule: s.rule, required: s.required, approvers: byPos.get(s.position) || [], groups: grpByPos.get(s.position) || [] }));
  return w;
}

module.exports = (r) => {
  // ── list templates (admin) ──
  r.get('/approval-workflows', requireAdmin, async (req, res) => {
    const rows = (await pool.query('select id from approval_workflows order by name')).rows;
    const out = [];
    for (const { id } of rows) out.push(await loadWorkflow(id));
    res.json(out);
  });

  // ── one template (admin) ──
  r.get('/approval-workflows/:wfId', requireAdmin, async (req, res) => {
    const w = await loadWorkflow(req.params.wfId);
    if (!w) return res.status(404).json({ error: 'not_found' });
    res.json(w);
  });

  // ── create template (admin) ──
  r.post('/approval-workflows', requireAdmin, async (req, res) => {
    const name = ((req.body && req.body.name) || '').trim();
    if (!name) return res.status(400).json({ error: 'name_required', detail: 'A template name is required.' });
    const steps = normalizeSteps(req.body);
    const w = (await pool.query(
      'insert into approval_workflows (name, description, created_by) values ($1,$2,$3) returning id',
      [name, (req.body.description || '').trim() || null, req.user.oid])).rows[0];
    await writeWorkflowSteps(w.id, steps);
    await audit(req, 'approval.workflow.create', name, { id: w.id, steps: steps.length });
    res.status(201).json(await loadWorkflow(w.id));
  });

  // ── update template (admin) ──
  r.put('/approval-workflows/:wfId', requireAdmin, async (req, res) => {
    const w = (await pool.query('select id, name from approval_workflows where id=$1', [req.params.wfId])).rows[0];
    if (!w) return res.status(404).json({ error: 'not_found' });
    const name = ((req.body && req.body.name) || '').trim();
    if (!name) return res.status(400).json({ error: 'name_required', detail: 'A template name is required.' });
    await pool.query('update approval_workflows set name=$2, description=$3, active=coalesce($4, active), updated_at=now() where id=$1',
      [w.id, name, (req.body.description || '').trim() || null, typeof req.body.active === 'boolean' ? req.body.active : null]);
    if (Array.isArray(req.body && req.body.steps)) await writeWorkflowSteps(w.id, normalizeSteps(req.body));
    await audit(req, 'approval.workflow.update', name, { id: w.id });
    res.json(await loadWorkflow(w.id));
  });

  // ── delete template (admin) ── (does not affect policies it was applied to)
  r.delete('/approval-workflows/:wfId', requireAdmin, async (req, res) => {
    const w = (await pool.query('delete from approval_workflows where id=$1 returning id, name', [req.params.wfId])).rows[0];
    if (!w) return res.status(404).json({ error: 'not_found' });
    await audit(req, 'approval.workflow.delete', w.name, { id: w.id });
    res.json({ ok: true });
  });

  // ── apply a template to a policy (owner/admin): copy its steps in ──
  r.post('/policies/:id/apply-workflow', async (req, res) => {
    const p = (await pool.query('select id, name, owner_oid, approval_state from policies where id=$1', [req.params.id])).rows[0];
    if (!p) return res.status(404).json({ error: 'not_found' });
    if (!(isAdmin(req) || (p.owner_oid && p.owner_oid === req.user.oid))) return res.status(403).json({ error: 'forbidden' });
    if (p.approval_state === 'in_review') return res.status(409).json({ error: 'bad_state', detail: 'Withdraw the review before applying a template.' });
    const wfId = req.body && req.body.workflowId;
    const w = wfId != null ? await loadWorkflow(wfId) : null;
    if (!w) return res.status(404).json({ error: 'not_found', detail: 'Unknown workflow template.' });
    if (!w.steps.length) return res.status(400).json({ error: 'no_approvers', detail: 'This template has no approvers.' });

    await pool.query('delete from policy_approvers where policy_id=$1', [p.id]);
    await pool.query('delete from policy_approval_steps where policy_id=$1', [p.id]);
    await pool.query('delete from policy_approver_groups where policy_id=$1', [p.id]);
    for (const s of w.steps) {
      await pool.query('insert into policy_approval_steps (policy_id, position, rule, required) values ($1,$2,$3,$4)', [p.id, s.position, s.rule, s.required]);
      for (const a of s.approvers) {
        await pool.query('insert into policy_approvers (policy_id, position, approver_oid) values ($1,$2,$3)', [p.id, s.position, a.oid]);
      }
      for (const g of s.groups) {
        await pool.query('insert into policy_approver_groups (policy_id, position, group_id) values ($1,$2,$3)', [p.id, s.position, g.id]);
      }
    }
    await audit(req, 'policy.approvers.apply-template', p.name, { id: p.id, workflow: w.id, steps: w.steps.length });
    res.json({ ok: true, steps: w.steps.length, approvers: w.steps.reduce((n, s) => n + s.approvers.length, 0), groups: w.steps.reduce((n, s) => n + s.groups.length, 0) });
  });
};
