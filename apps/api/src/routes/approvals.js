// ============================================================
//  Policy approval workflow (ADR-120).
//  Sequential STEPS; each step may hold one or more approvers with a rule:
//    all    — everyone in the step must approve (default; == Phase 1 chain)
//    any    — a single approval clears the step
//    quorum — at least `required` of the step's approvers must approve
//  Approval is per-version and per-run (a run starts at submit; decisions
//  before submitted_at belong to an earlier run, so a changes-requested →
//  resubmit cycle restarts the chain cleanly).
//  Decisions are append-only (policy_approvals; REVOKE update/delete).
// ============================================================
const { pool } = require('../db');
const cfg = require('../config');
const { isAdmin, audit } = require('../authz');
const { sendMail } = require('../services/reminders');
const { escapeHtml } = require('../util');

// Owner or admin may drive the workflow (submit/withdraw/publish/config).
const canGovern = (req, p) => isAdmin(req) || (p.owner_oid && p.owner_oid === req.user.oid);

// How many distinct approvals a step needs, given its rule + membership.
const stepTarget = (rule, required, memberCount) =>
  rule === 'any' ? 1
    : rule === 'quorum' ? Math.min(Math.max(required || 1, 1), memberCount)
      : memberCount; // 'all'

// ── Email notifications (fire-and-forget, config-gated, idempotent) ──
// No-op unless GRAPH_MAIL_SENDER is set (same as reminders). Each (policy, user,
// milestone, version) is sent at most once via notifications_sent.
async function emailOnce(policyId, userOid, milestone, version, subject, bodyLine) {
  if (!cfg.graph.mailSender || !userOid) return;
  const dup = (await pool.query(
    'select 1 from notifications_sent where policy_id=$1 and user_oid=$2 and milestone=$3 and policy_version=$4',
    [policyId, userOid, milestone, version])).rows[0];
  if (dup) return;
  const e = (await pool.query('select coalesce(email, upn) as email, display_name from employees where oid=$1', [userOid])).rows[0];
  if (!e || !e.email) return;
  const link = cfg.frontendUrl || '';
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;color:#23283a;line-height:1.6">
    <p>Hello ${escapeHtml(e.display_name || 'there')},</p><p>${bodyLine}</p>
    ${link ? `<p><a href="${link}" style="background:#213a9e;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block">Open the Governance Portal</a></p>` : ''}
    <p style="color:#8a92a6;font-size:12px">Automated approval notification from the Birgma Governance Portal.</p></div>`;
  await sendMail(e.email, subject, html);
  await pool.query('insert into notifications_sent (policy_id, user_oid, milestone, policy_version) values ($1,$2,$3,$4) on conflict do nothing',
    [policyId, userOid, milestone, version]);
}
// Run a notification without blocking or failing the request.
const notify = (fn) => { Promise.resolve().then(fn).catch(() => {}); };

// Notify every approver in a step that their decision is requested.
function notifyStep(p, step) {
  for (const a of step.approvers) {
    notify(() => emailOnce(p.id, a.oid, 'approval:step:' + step.position, p.version,
      'Approval requested: ' + p.name,
      `Your approval is requested for <strong>${escapeHtml(p.name)}</strong> (${escapeHtml(p.version)}).`));
  }
}

// Resolve every group approver of a policy to its CURRENT members and freeze
// them into policy_approvers for the run (snapshot-at-submit). Previously
// expanded rows (from_group not null) are cleared first, so re-submitting after
// changes picks up fresh membership. A directly-named approver (from_group null)
// wins over a group-expanded duplicate at the same step (ON CONFLICT).
async function expandGroups(policyId) {
  await pool.query('delete from policy_approvers where policy_id=$1 and from_group is not null', [policyId]);
  const groups = (await pool.query('select position, group_id from policy_approver_groups where policy_id=$1', [policyId])).rows;
  for (const g of groups) {
    await pool.query(
      `insert into policy_approvers (policy_id, position, approver_oid, from_group)
         select $1, $2, m.employee_oid, $3
           from effective_group_membership m
           join employees e on e.oid = m.employee_oid
          where m.group_id = $3 and coalesce(e.status, 'Active') <> 'Inactive'
       on conflict (policy_id, position, approver_oid) do nothing`, [policyId, g.position, g.group_id]);
  }
}

// Load the approval context for a policy: the ordered STEPS (each a group of
// approvers + optional directory groups + rule), the decision log for the
// current version, per-step run approvals, and which step is currently awaiting
// a decision. The step list is authoritative from policy_approval_steps, unioned
// with any positions that carry approvers/groups (defensive / pre-2b data).
async function ctx(policyId) {
  const p = (await pool.query(
    'select id, name, version, owner_oid, approval_state, approved_version, submitted_at from policies where id=$1',
    [policyId])).rows[0];
  if (!p) return null;
  const approverRows = (await pool.query(
    `select pa.position, pa.approver_oid, pa.from_group, e.display_name from policy_approvers pa
       left join employees e on e.oid = pa.approver_oid
      where pa.policy_id=$1 order by pa.position, pa.approver_oid`, [policyId])).rows;
  const groupRows = (await pool.query(
    `select pg.position, pg.group_id, g.name from policy_approver_groups pg
       left join groups g on g.id = pg.group_id
      where pg.policy_id=$1 order by pg.position, pg.group_id`, [policyId])).rows;
  const ruleRows = (await pool.query(
    'select position, rule, required from policy_approval_steps where policy_id=$1', [policyId])).rows;
  const rules = new Map(ruleRows.map((r) => [r.position, r]));
  const decisions = (await pool.query(
    `select step_position, approver_oid, decision, comment, decided_at from policy_approvals
      where policy_id=$1 and policy_version=$2 order by decided_at`, [policyId, p.version])).rows;

  // Distinct approver oids who APPROVED at each position within the current run.
  const inRun = (d) => !p.submitted_at || new Date(d.decided_at) >= new Date(p.submitted_at);
  const approvedByPos = new Map();
  for (const d of decisions) {
    if (d.decision !== 'approved' || !inRun(d)) continue;
    if (!approvedByPos.has(d.step_position)) approvedByPos.set(d.step_position, new Set());
    approvedByPos.get(d.step_position).add(d.approver_oid);
  }
  const peopleByPos = new Map();
  for (const a of approverRows) {
    if (!peopleByPos.has(a.position)) peopleByPos.set(a.position, []);
    peopleByPos.get(a.position).push({ oid: a.approver_oid, name: a.display_name, from_group: a.from_group });
  }
  const groupsByPos = new Map();
  for (const g of groupRows) {
    if (!groupsByPos.has(g.position)) groupsByPos.set(g.position, []);
    groupsByPos.get(g.position).push({ id: g.group_id, name: g.name });
  }
  const positions = [...new Set([...rules.keys(), ...peopleByPos.keys(), ...groupsByPos.keys()])].sort((x, y) => x - y);
  const steps = positions.map((position) => {
    const approvers = peopleByPos.get(position) || [];
    const groups = groupsByPos.get(position) || [];
    const r = rules.get(position) || {};
    const rule = r.rule || 'all';
    const target = stepTarget(rule, r.required, approvers.length);
    const approvedOids = [...(approvedByPos.get(position) || new Set())];
    return { position, rule, required: target, approvers, groups, approvedOids, satisfied: approvedOids.length >= target };
  });
  const currentStep = p.approval_state === 'in_review' ? (steps.find((s) => !s.satisfied) || null) : null;
  return { p, steps, decisions, currentStep };
}

// Shape a step for the API (no internal fields leak).
const stepDto = (s) => ({
  position: s.position, rule: s.rule, required: s.required,
  approvers: s.approvers.map((a) => ({ oid: a.oid, name: a.name, from_group: a.from_group })),
  groups: s.groups, approvedOids: s.approvedOids, satisfied: s.satisfied,
});

module.exports = (r) => {
  // ── configure the approver steps (owner/admin) ──
  // Accepts either { approverOids:[...] } (one approver per step, rule 'all' —
  // the Phase 1 form) or { steps:[{ approverOids:[...], groupIds:[...], rule,
  // required }] }. A step may name people, reference directory groups, or both;
  // groups are resolved to their members at submit time.
  r.put('/policies/:id/approvers', async (req, res) => {
    const c = await ctx(req.params.id);
    if (!c) return res.status(404).json({ error: 'not_found' });
    if (!canGovern(req, c.p)) return res.status(403).json({ error: 'forbidden' });
    if (c.p.approval_state === 'in_review') return res.status(409).json({ error: 'bad_state', detail: 'Withdraw the review before changing approvers.' });

    let steps;
    if (Array.isArray(req.body && req.body.steps)) {
      steps = req.body.steps.map((s) => ({
        approverOids: [...new Set((Array.isArray(s.approverOids) ? s.approverOids : []).filter(Boolean))],
        groupIds: [...new Set((Array.isArray(s.groupIds) ? s.groupIds : []).filter(Boolean))],
        rule: ['all', 'any', 'quorum'].includes(s.rule) ? s.rule : 'all',
        required: Number.isInteger(s.required) ? s.required : null,
      })).filter((s) => s.approverOids.length || s.groupIds.length);
    } else {
      const oids = Array.isArray(req.body && req.body.approverOids) ? req.body.approverOids : [];
      steps = oids.filter(Boolean).map((oid) => ({ approverOids: [oid], groupIds: [], rule: 'all', required: null }));
    }

    await pool.query('delete from policy_approvers where policy_id=$1', [c.p.id]);
    await pool.query('delete from policy_approval_steps where policy_id=$1', [c.p.id]);
    await pool.query('delete from policy_approver_groups where policy_id=$1', [c.p.id]);
    let pos = 1, approverCount = 0, groupCount = 0;
    for (const s of steps) {
      for (const oid of s.approverOids) {
        await pool.query('insert into policy_approvers (policy_id, position, approver_oid) values ($1,$2,$3)', [c.p.id, pos, oid]);
        approverCount++;
      }
      const required = s.rule === 'quorum' ? Math.max(s.required || 1, 1) : null;
      await pool.query('insert into policy_approval_steps (policy_id, position, rule, required) values ($1,$2,$3,$4)', [c.p.id, pos, s.rule, required]);
      for (const gid of s.groupIds) {
        await pool.query('insert into policy_approver_groups (policy_id, position, group_id) values ($1,$2,$3)', [c.p.id, pos, gid]);
        groupCount++;
      }
      pos++;
    }
    await audit(req, 'policy.approvers.set', c.p.name, { id: c.p.id, steps: steps.length, approvers: approverCount, groups: groupCount });
    res.json({ ok: true, steps: steps.length, approvers: approverCount, groups: groupCount });
  });

  // ── submit for approval (owner/admin): -> in_review ──
  r.post('/policies/:id/submit', async (req, res) => {
    const pre = await ctx(req.params.id);
    if (!pre) return res.status(404).json({ error: 'not_found' });
    if (!canGovern(req, pre.p)) return res.status(403).json({ error: 'forbidden' });
    if (!pre.steps.length) return res.status(400).json({ error: 'no_approvers', detail: 'Add at least one approver first.' });
    if (pre.p.approval_state === 'in_review') return res.status(409).json({ error: 'bad_state', detail: 'Already in review.' });
    // Freeze current group membership into the run, then re-read.
    await expandGroups(pre.p.id);
    const c = await ctx(req.params.id);
    const empty = c.steps.find((s) => !s.approvers.length);
    if (empty) return res.status(400).json({ error: 'no_approvers', detail: `Step ${empty.position} has no members to approve — its group is empty or all members are inactive.` });
    await pool.query(
      `update policies set approval_state='in_review', approved_externally=false, approved_version=null,
         submitted_at=now(), submitted_by=$2, updated_at=now() where id=$1`, [c.p.id, req.user.oid]);
    await audit(req, 'policy.approval.submit', c.p.name, { id: c.p.id, version: c.p.version });
    notifyStep(c.p, c.steps[0]);
    res.json({ ok: true, approval_state: 'in_review' });
  });

  // ── a step decision (a current-step approver, or admin override) ──
  async function decide(req, res, decision) {
    const c = await ctx(req.params.id);
    if (!c) return res.status(404).json({ error: 'not_found' });
    if (c.p.approval_state !== 'in_review' || !c.currentStep) return res.status(409).json({ error: 'bad_state', detail: 'This policy is not awaiting your approval.' });
    const step = c.currentStep;
    const isMember = step.approvers.some((a) => a.oid === req.user.oid);
    if (!isMember && !isAdmin(req)) return res.status(403).json({ error: 'not_pending_approver' });
    if (decision === 'approved' && step.approvedOids.includes(req.user.oid)) {
      return res.status(409).json({ error: 'bad_state', detail: 'You have already approved this step.' });
    }
    const comment = ((req.body && req.body.comment) || '').trim();
    if ((decision === 'rejected' || decision === 'changes_requested') && !comment) {
      return res.status(400).json({ error: 'comment_required', detail: 'A comment is required to reject or request changes.' });
    }
    await pool.query(
      'insert into policy_approvals (policy_id, policy_version, step_position, approver_oid, decision, comment) values ($1,$2,$3,$4,$5,$6)',
      [c.p.id, c.p.version, step.position, req.user.oid, decision, comment || null]);

    let state = 'in_review', nextStep = null;
    if (decision === 'rejected') state = 'rejected';
    else if (decision === 'changes_requested') state = 'changes_requested';
    else {
      // Does this approval satisfy the current step?
      const nowApproved = new Set([...step.approvedOids, req.user.oid]).size;
      if (nowApproved >= step.required) {
        const later = c.steps.filter((s) => s.position > step.position);
        if (!later.length) state = 'approved';
        else nextStep = later[0];
      }
    }
    if (state === 'approved') {
      await pool.query("update policies set approval_state='approved', approved_version=$2, updated_at=now() where id=$1", [c.p.id, c.p.version]);
    } else if (state !== 'in_review') {
      await pool.query('update policies set approval_state=$2, updated_at=now() where id=$1', [c.p.id, state]);
    }
    await audit(req, 'policy.approval.' + decision, c.p.name, { id: c.p.id, version: c.p.version, step: step.position });

    // Notify: the next step's approvers when the chain advances, else the owner.
    if (decision === 'approved' && nextStep) {
      notifyStep(c.p, nextStep);
    } else if (state !== 'in_review' && c.p.owner_oid) {
      const msg = state === 'approved'
        ? `<strong>${escapeHtml(c.p.name)}</strong> (${escapeHtml(c.p.version)}) is fully approved and ready to publish.`
        : decision === 'rejected'
          ? `<strong>${escapeHtml(c.p.name)}</strong> was rejected. Comment: “${escapeHtml(comment)}”.`
          : `<strong>${escapeHtml(c.p.name)}</strong> needs changes. Comment: “${escapeHtml(comment)}”.`;
      notify(() => emailOnce(c.p.id, c.p.owner_oid, 'approval:' + state, c.p.version, 'Approval update: ' + c.p.name, msg));
    }
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
    const alreadyApproved = c.currentStep && c.currentStep.approvedOids.includes(req.user.oid);
    const isCurrentMember = c.currentStep && c.currentStep.approvers.some((a) => a.oid === req.user.oid);
    res.json({
      approval_state: c.p.approval_state,
      approved_version: c.p.approved_version,
      steps: c.steps.map(stepDto),
      currentStep: c.currentStep ? stepDto(c.currentStep) : null,
      decisions: c.decisions,
      canAct: !!(c.currentStep && !alreadyApproved && (isCurrentMember || isAdmin(req))),
      canGovern: canGovern(req, c.p),
    });
  });

  // ── "my approvals": policies awaiting the caller's decision ──
  r.get('/approvals/pending', async (req, res) => {
    const ids = (await pool.query(
      "select id from policies where approval_state='in_review' and archived_at is null")).rows;
    const mine = [];
    for (const { id } of ids) {
      const c = await ctx(id);
      if (c && c.currentStep
        && c.currentStep.approvers.some((a) => a.oid === req.user.oid)
        && !c.currentStep.approvedOids.includes(req.user.oid)) {
        mine.push({ id: c.p.id, name: c.p.name, version: c.p.version, submitted_at: c.p.submitted_at });
      }
    }
    res.json(mine);
  });
};
