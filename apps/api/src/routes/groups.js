// Generated from the former monolithic routes.js — handler bodies are verbatim.
const { pool } = require('../db');
const { requireAdmin } = require('../auth');
const { audit } = require('../authz');

module.exports = (r) => {
// ── GROUPS (admin) — create groups + manage membership ───────
// List every group with live member + policy counts.
r.get('/groups', requireAdmin, async (_req, res) => {
  const rows = (await pool.query(`
    select g.*,
      (select count(*) from employee_groups eg where eg.group_id = g.id) as member_count,
      (select count(*) from policy_groups  pg where pg.group_id = g.id) as policy_count
    from groups g where g.archived_at is null order by g.name`)).rows;
  res.json(rows);
});

// ── archive / restore / delete a group (admin) ──────────────────────
// Archived groups leave the grid and stop contributing to compliance,
// but keep their assignments/mappings and can be restored.
r.post('/groups/:id/archive', requireAdmin, async (req, res) => {
  const g = (await pool.query('update groups set archived_at=now() where id=$1 and archived_at is null returning name', [req.params.id])).rows[0];
  if (!g) return res.status(404).json({ error: 'not_found' });
  await audit(req, 'group.archive', g.name);
  res.status(204).end();
});

r.post('/groups/:id/restore', requireAdmin, async (req, res) => {
  const g = (await pool.query('update groups set archived_at=null where id=$1 returning name', [req.params.id])).rows[0];
  await audit(req, 'group.restore', g && g.name);
  res.status(204).end();
});

// List archived groups (admin).
r.get('/groups-archived', requireAdmin, async (_req, res) => {
  res.json((await pool.query(`
    select g.id, g.name, g.kind, g.archived_at,
      (select count(*) from policy_groups pg where pg.group_id = g.id) as policy_count,
      (select count(*) from employee_groups eg where eg.group_id = g.id) as member_count
    from groups g where g.archived_at is not null order by g.archived_at desc`)).rows);
});

// Hard-delete a group. Blocked while it still has policy assignments or directory
// mappings (archive those away first). Signatures are never affected by groups.
r.delete('/groups/:id', requireAdmin, async (req, res) => {
  const used = (await pool.query(
    `select (select count(*) from policy_groups where group_id=$1) as policies,
            (select count(*) from group_mappings where platform_group_id=$1 or ad_group_id=$1) as mappings`,
    [req.params.id])).rows[0];
  if (Number(used.policies) > 0 || Number(used.mappings) > 0) {
    return res.status(409).json({ error: 'group_in_use', detail: 'Remove its policy assignments and directory mappings first, or archive it instead.' });
  }
  const g = (await pool.query('delete from groups where id=$1 returning name', [req.params.id])).rows[0];
  if (!g) return res.status(404).json({ error: 'not_found' });
  await audit(req, 'group.delete', g.name);
  res.status(204).end();
});

// Members of one group.
r.get('/groups/:id/members', requireAdmin, async (req, res) => {
  res.json((await pool.query(
    `select e.* from employee_groups eg join employees e on e.oid = eg.employee_oid
      where eg.group_id = $1 order by e.display_name`, [req.params.id])).rows);
});

// Create a LOCAL group (Entra groups arrive via sync).
r.post('/groups', requireAdmin, async (req, res) => {
  const { name, description } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'name_required' });
  let g;
  try {
    g = (await pool.query(
      `insert into groups (name, description, source, kind) values ($1,$2,'Local','Local') returning *`,
      [name.trim(), description || null]
    )).rows[0];
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'name_taken', detail: 'A group with that name already exists.' });
    throw e;
  }
  await audit(req, 'group.create', g.name, { id: g.id, kind: 'Local' });
  res.status(201).json(g);
});

// Add a member — allowed only for LOCAL groups (Entra membership is
// owned by Entra and overwritten on the next sync).
r.post('/groups/:id/members', requireAdmin, async (req, res) => {
  const g = (await pool.query('select source from groups where id=$1', [req.params.id])).rows[0];
  if (!g) return res.status(404).json({ error: 'not_found' });
  if (g.source !== 'Local') return res.status(409).json({ error: 'manage_in_entra' });
  await pool.query('insert into employee_groups (employee_oid, group_id) values ($1,$2) on conflict do nothing',
    [req.body.employeeOid, req.params.id]);
  await audit(req, 'group.member.add', req.params.id, { employeeOid: req.body.employeeOid });
  res.status(204).end();
});

r.delete('/groups/:id/members/:oid', requireAdmin, async (req, res) => {
  const g = (await pool.query('select source from groups where id=$1', [req.params.id])).rows[0];
  if (g && g.source !== 'Local') return res.status(409).json({ error: 'manage_in_entra' });
  await pool.query('delete from employee_groups where group_id=$1 and employee_oid=$2',
    [req.params.id, req.params.oid]);
  await audit(req, 'group.member.remove', req.params.id, { employeeOid: req.params.oid });
  res.status(204).end();
});

// ── PLATFORM GROUPS + AD MAPPING (admin) ─────────────────────
// Platform groups (Administrators / Compliance / Read All / …) with the
// directory groups mapped into them and the effective (rolled-up) member count.
r.get('/platform-groups', requireAdmin, async (_req, res) => {
  const pgs = (await pool.query(`select id, name, description, kind from groups where kind in ('Platform','Local') and archived_at is null order by kind, name`)).rows;
  const out = [];
  for (const pg of pgs) {
    const mapped = (await pool.query(
      `select g.id, g.name, g.source,
              (select count(*) from employee_groups eg where eg.group_id=g.id) as members
         from group_mappings gm join groups g on g.id=gm.ad_group_id
        where gm.platform_group_id=$1 order by g.name`, [pg.id])).rows;
    const eff = (await pool.query(
      `select count(*)::int as c from (
         select employee_oid from employee_groups where group_id=$1
         union
         select employee_oid from group_effective_members where group_id=$1
       ) t`, [pg.id])).rows[0].c;
    out.push({ ...pg, mapped, memberCount: eff });
  }
  res.json(out);
});

// Importable directory groups (already synced) to choose from.
r.get('/directory-groups', requireAdmin, async (_req, res) => {
  res.json((await pool.query(
    `select g.id, g.name, g.source,
            (select count(*) from employee_groups eg where eg.group_id=g.id) as members
       from groups g where g.kind='Directory' and g.archived_at is null order by g.name`)).rows);
});

// Map an imported AD group into a platform group.
r.post('/group-mappings', requireAdmin, async (req, res) => {
  const { adGroupId, platformGroupId } = req.body || {};
  await pool.query(
    `insert into group_mappings (ad_group_id, platform_group_id) values ($1,$2) on conflict do nothing`,
    [adGroupId, platformGroupId]);
  await audit(req, 'group.mapping.add', platformGroupId, { adGroupId });
  res.status(201).json({ ok: true });
});

r.delete('/group-mappings/:adId/:pgId', requireAdmin, async (req, res) => {
  await pool.query('delete from group_mappings where ad_group_id=$1 and platform_group_id=$2',
    [req.params.adId, req.params.pgId]);
  await audit(req, 'group.mapping.remove', req.params.pgId, { adGroupId: req.params.adId });
  res.status(204).end();
});

// Create a platform group.
r.post('/platform-groups', requireAdmin, async (req, res) => {
  const { name, description } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'name_required' });
  let g;
  try {
    g = (await pool.query(
      `insert into groups (name, description, source, kind) values ($1,$2,'Local','Platform') returning id,name,description`,
      [name.trim(), description || null])).rows[0];
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'name_taken', detail: 'A group with that name already exists.' });
    throw e;
  }
  await audit(req, 'group.create', g.name, { id: g.id, kind: 'Platform' });
  res.status(201).json(g);
});
};
