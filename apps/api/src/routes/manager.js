// Generated from the former monolithic routes.js — handler bodies are verbatim.
const { pool } = require('../db');
const { requireManager } = require('../auth');
const { runReminders } = require('../services/reminders');
const { audit, teamOids } = require('../authz');

module.exports = (r) => {
// Manager dashboard: compliance for the manager's team across policies + trainings.
r.get('/manager/dashboard', requireManager, async (req, res) => {
  const oids = await teamOids(req.user.oid);
  if (!oids.length) return res.json({ team: [], items: [], summary: { people: 0, compliant: 0, assigned: 0, signed: 0, pct: 0 } });
  const q = await pool.query(`
    with team as (select oid from employees where oid = any($1::uuid[])),
    eff as (
      select group_id, employee_oid as oid from effective_group_membership
    ),
    required as (
      select distinct pg.policy_id, t.oid
        from policy_groups pg
        join policies p on p.id=pg.policy_id and p.archived_at is null
                       and (p.approved_externally or p.approval_state='published')
        join eff em on em.group_id=pg.group_id
        join team t on t.oid=em.oid
    ),
    signed as (
      select r.policy_id, r.oid from required r join policies p on p.id=r.policy_id
        join signatures s on s.policy_id=r.policy_id and s.user_oid=r.oid and s.policy_version=p.version
    )
    select 'item' as kind, p.id, p.name, p.doc_type, null::uuid as oid, null as display_name, null as department, null as email,
           (select count(*) from required q where q.policy_id=p.id)::int as assigned,
           (select count(*) from signed g where g.policy_id=p.id)::int as signed
      from policies p where p.id in (select distinct policy_id from required)
    union all
    select 'person' as kind, null, null, null, e.oid, e.display_name, e.department, coalesce(e.email,e.upn),
           (select count(*) from required q where q.oid=e.oid)::int,
           (select count(*) from signed g where g.oid=e.oid)::int
      from employees e where e.oid = any($1::uuid[])
  `, [oids]);
  const items = q.rows.filter((r) => r.kind === 'item').map((r) => ({ id: r.id, name: r.name, docType: r.doc_type, assigned: r.assigned, signed: r.signed }));
  const team = q.rows.filter((r) => r.kind === 'person').map((r) => ({ oid: r.oid, name: r.display_name, department: r.department, email: r.email, required: r.assigned, signed: r.signed, pct: r.assigned ? Math.round(r.signed / r.assigned * 100) : 100 }));
  const assigned = team.reduce((s, p) => s + p.required, 0);
  const signedTot = team.reduce((s, p) => s + p.signed, 0);
  const compliant = team.filter((p) => p.required > 0 && p.signed >= p.required).length;
  res.json({ team, items, summary: { people: team.length, compliant, assigned, signed: signedTot, pct: assigned ? Math.round(signedTot / assigned * 100) : 0 } });
});

// Manager: send acknowledgement reminders to their team only.
r.post('/manager/reminders/run', requireManager, async (req, res) => {
  try { const oids = await teamOids(req.user.oid); const out = await runReminders({ onlyOids: oids }); await audit(req, 'manager.reminders.run', null, out); res.json({ status: 'success', ...out }); }
  catch (e) { res.status(502).json({ status: 'error', error: e.message }); }
});
};
