// Generated from the former monolithic routes.js — handler bodies are verbatim.
const { pool } = require('../db');
const { requireAdmin } = require('../auth');

module.exports = (r) => {
// ── compliance dashboard aggregates (admin) ──────────────────
// "required" = active employees who are members of ANY group the policy
//   is assigned to (counted once, even if in several matching groups).
// "signed"   = those who signed the CURRENT version.
r.get('/dashboard', requireAdmin, async (_req, res) => {
  const rows = (await pool.query(`
    with eff_members as (
      select group_id, employee_oid as oid from effective_group_membership
    ),
    required as (
      select distinct pg.policy_id, em.oid
        from policy_groups pg
        join policies pp on pp.id = pg.policy_id and pp.archived_at is null
        join eff_members em on em.group_id = pg.group_id
        join employees e on e.oid = em.oid and e.status = 'Active'
    ),
    signed as (
      select distinct r.policy_id, r.oid
        from required r
        join policies p on p.id = r.policy_id
        join signatures s on s.policy_id = r.policy_id
                          and s.user_oid = r.oid
                          and s.policy_version = p.version
    )
    select p.id, p.name, p.doc_type, p.version,
           (select count(*) from required q where q.policy_id = p.id)::int as assigned,
           (select count(*) from signed   g where g.policy_id = p.id)::int as signed
      from policies p where p.archived_at is null order by p.name`)).rows;
  res.json(rows);
});

// ── compliance by department (admin) — powers the dashboard "By unit" view ──
r.get('/dashboard/by-department', requireAdmin, async (_req, res) => {
  const rows = (await pool.query(`
    with eff_members as (
      select group_id, employee_oid as oid from effective_group_membership
    ),
    required as (
      select distinct pg.policy_id, em.oid, e.department
        from policy_groups pg
        join policies pp on pp.id = pg.policy_id and pp.archived_at is null
        join eff_members em on em.group_id = pg.group_id
        join employees e on e.oid = em.oid and e.status = 'Active'
    ),
    signed as (
      select r.department, r.policy_id, r.oid
        from required r
        join policies p on p.id = r.policy_id
        join signatures s on s.policy_id = r.policy_id
                          and s.user_oid = r.oid
                          and s.policy_version = p.version
    )
    select r.department as role,
           count(distinct r.oid)::int as people,
           count(*)::int as assigned,
           (select count(*)::int from signed g where g.department = r.department) as signed
      from required r
     group by r.department
     order by r.department`)).rows;
  res.json(rows);
});

// ── compliance by group (admin) — powers the dashboard "By group" view ──
r.get('/dashboard/by-group', requireAdmin, async (_req, res) => {
  const rows = (await pool.query(`
    with eff as (
      select group_id, employee_oid as oid from effective_group_membership
    ),
    pairs as (
      select pg.group_id, pg.policy_id, em.oid, p.version
        from policy_groups pg
        join policies p on p.id = pg.policy_id and p.archived_at is null
        join eff em on em.group_id = pg.group_id
        join employees e on e.oid = em.oid and e.status = 'Active'
    )
    select g.id, g.name, g.kind,
      (select count(distinct oid) from eff e2 where e2.group_id = g.id)::int as members,
      (select count(distinct policy_id) from policy_groups pgx where pgx.group_id = g.id)::int as policies,
      (select count(*) from pairs pr where pr.group_id = g.id)::int as assigned,
      (select count(*) from pairs pr where pr.group_id = g.id
         and exists (select 1 from signatures s where s.policy_id = pr.policy_id and s.user_oid = pr.oid and s.policy_version = pr.version))::int as signed
      from groups g
     where g.kind in ('Platform','Local')
     order by g.kind, g.name`)).rows;
  res.json(rows);
});

// ── per-group member completion (admin) — who has signed vs not ──
r.get('/dashboard/group/:id', requireAdmin, async (req, res) => {
  const rows = (await pool.query(`
    with eff as (
      select group_id, employee_oid as oid from effective_group_membership
    ),
    members as (
      select distinct em.oid from eff em
        join employees e on e.oid = em.oid and e.status = 'Active'
       where em.group_id = $1
    ),
    pols as (
      select pg.policy_id, p.version from policy_groups pg
        join policies p on p.id = pg.policy_id and p.archived_at is null
       where pg.group_id = $1
    )
    select e.oid, e.display_name, e.email, e.upn, e.department,
      (select count(*) from pols)::int as required,
      (select count(*) from pols pl where exists (
         select 1 from signatures s where s.policy_id = pl.policy_id and s.user_oid = e.oid and s.policy_version = pl.version))::int as signed
      from members m join employees e on e.oid = m.oid
     order by e.display_name`, [req.params.id])).rows;
  res.json(rows);
});

// ── full compliance report (admin) — one row per required (employee, policy) ──
r.get('/reports/compliance', requireAdmin, async (req, res) => {
  const { department, group } = req.query;
  const params = [];
  let filter = '';
  if (group) {
    // restrict to the chosen group's matrix: its members × its assigned policies
    params.push(group);
    filter = `and r.oid in (
        select em.oid from eff em where em.group_id = $1
      ) and r.policy_id in (
        select pg.policy_id from policy_groups pg where pg.group_id = $1
      )`;
  } else if (department) {
    params.push(department);
    filter = 'and e.department = $1';
  }
  const rows = (await pool.query(`
    with eff as (
      select group_id, employee_oid as oid from effective_group_membership
    ),
    req as (
      select distinct pg.policy_id, em.oid
        from policy_groups pg
        join policies p on p.id = pg.policy_id and p.archived_at is null
        join eff em on em.group_id = pg.group_id
        join employees e on e.oid = em.oid and e.status = 'Active'
    )
    select e.display_name, e.email, e.upn, e.department,
           p.name as policy, p.doc_type, p.version as current_version,
           s.policy_version as signed_version, s.signed_at, s.full_name as signed_as,
           case when s.id is not null and s.policy_version = p.version then 'Signed'
                when s.id is not null then 'Outdated'
                else 'Pending' end as status
      from req r
      join employees e on e.oid = r.oid
      join policies p on p.id = r.policy_id
      left join lateral (
        select * from signatures s where s.policy_id = r.policy_id and s.user_oid = r.oid
         order by s.signed_at desc limit 1
      ) s on true
     where true ${filter}
     order by e.display_name, p.name`, params)).rows;
  res.json(rows);
});
};
