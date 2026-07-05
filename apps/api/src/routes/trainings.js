// Generated from the former monolithic routes.js — handler bodies are verbatim.
const { pool } = require('../db');
const { requireManager } = require('../auth');
const { isAdmin, audit, canManage, canRead } = require('../authz');
const { UPLOAD_TYPES, withUpload, MGR_DOC_TYPES } = require('../uploads');
const storage = require('../storage');
const path = require('path');

module.exports = (r) => {
// Groups a manager can assign trainings to (id + name + kind only).
r.get('/trainings/groups', requireManager, async (_req, res) => {
  res.json((await pool.query(
    `select id, name, kind from groups where archived_at is null and kind in ('Platform','Local','Directory') order by kind, name`)).rows);
});

// How many distinct active people a set of groups reaches (effective membership).
// Powers the "reaches N people" line in the assign drawer.
r.get('/groups/reach', requireManager, async (req, res) => {
  const ids = String(req.query.ids || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!ids.length) return res.json({ count: 0 });
  const r = await pool.query(`
    select count(distinct em.oid)::int as count from (
      select group_id, employee_oid as oid from effective_group_membership
    ) em join employees e on e.oid=em.oid and e.status='Active'
     where em.group_id = any($1::uuid[])`, [ids]);
  res.json({ count: r.rows[0].count });
});

// List the manager's own uploaded documents (admins see all uploads).
r.get('/trainings', requireManager, async (req, res) => {
  const mine = isAdmin(req) ? '' : 'and p.owner_oid = $1';
  const params = isAdmin(req) ? [] : [req.user.oid];
  res.json((await pool.query(
    `with eff as (
       select group_id, employee_oid as oid from effective_group_membership
     )
     select p.*, coalesce(array_agg(distinct g.name) filter (where g.id is not null), '{}') as groups,
            coalesce(array_agg(distinct pg.group_id::text) filter (where pg.group_id is not null), '{}') as group_ids,
            (select count(distinct em.oid) from policy_groups x join eff em on em.group_id=x.group_id
               join employees e on e.oid=em.oid and e.status='Active' where x.policy_id=p.id)::int as assigned,
            (select count(distinct s.user_oid) from signatures s where s.policy_id=p.id and s.policy_version=p.version)::int as signed
       from policies p
       left join policy_groups pg on pg.policy_id = p.id
       left join groups g on g.id = pg.group_id
      where p.source = 'Upload' and p.archived_at is null ${mine}
      group by p.id order by p.updated_at desc`, params)).rows);
});

// Create an uploaded document (manager/admin) with a file. Any allowed doc type.
r.post('/trainings', requireManager, withUpload, async (req, res) => {
  const { name, version, groupIds, dueDate, dueDays, reviewDate } = req.body || {};
  let { docType } = req.body || {};
  docType = MGR_DOC_TYPES.includes(docType) ? docType : 'Training';
  if (!name || !name.trim()) return res.status(400).json({ error: 'name_required' });
  if (!req.file) return res.status(400).json({ error: 'file_required', detail: 'Upload a file.' });
  const gids = groupIds ? (Array.isArray(groupIds) ? groupIds : String(groupIds).split(',').filter(Boolean)) : [];
  const key = await storage.finalize(req.file);   // persist to the configured backend
  const p = (await pool.query(
    `insert into policies (name, doc_type, version, sharepoint_url, owner, owner_oid, source, upload_path, upload_name, upload_mime, due_date, due_days, review_date)
     values ($1,$2,$3,'',$4,$5,'Upload',$6,$7,$8,$9,$10,$11) returning *`,
    [name.trim(), docType, version || 'v1.0', req.user.name, req.user.oid, key, req.file.originalname, req.file.mimetype,
     dueDate || null, (dueDays!==undefined && dueDays!=='') ? parseInt(dueDays,10) : null, reviewDate || null]
  )).rows[0];
  for (const gid of gids) await pool.query('insert into policy_groups (policy_id, group_id) values ($1,$2) on conflict do nothing', [p.id, gid]);
  await pool.query('insert into policy_versions (policy_id, version, note, changed_by) values ($1,$2,$3,$4)', [p.id, p.version, docType + ' created', req.user.name]);
  await audit(req, 'training.create', p.name, { id: p.id, docType });
  res.status(201).json(p);
});

// Update a training (own only). Optional new file replaces the old one.
r.put('/trainings/:id', requireManager, withUpload, async (req, res) => {
  if (!(await canManage(req, req.params.id))) return res.status(403).json({ error: 'forbidden', detail: 'not your training' });
  const { name, version, groupIds, dueDate, dueDays, reviewDate, versionNote } = req.body || {};
  let { docType } = req.body || {};
  const prev = (await pool.query('select version, upload_path, doc_type from policies where id=$1', [req.params.id])).rows[0];
  if (!prev) return res.status(404).json({ error: 'not_found' });
  docType = MGR_DOC_TYPES.includes(docType) ? docType : prev.doc_type;
  const newFile = req.file || null;
  const newKey = newFile ? await storage.finalize(newFile) : null;
  const p = (await pool.query(
    `update policies set name=$2, doc_type=$3, version=$4, due_date=$5, due_days=$6, review_date=$7,
        upload_path=coalesce($8, upload_path), upload_name=coalesce($9, upload_name), upload_mime=coalesce($10, upload_mime),
        updated_at=now()
      where id=$1 returning *`,
    [req.params.id, name, docType, version, dueDate || null, (dueDays!==undefined && dueDays!=='') ? parseInt(dueDays,10) : null, reviewDate || null,
     newKey, newFile ? newFile.originalname : null, newFile ? newFile.mimetype : null]
  )).rows[0];
  if (Array.isArray(groupIds) || typeof groupIds === 'string') {
    const gids = Array.isArray(groupIds) ? groupIds : String(groupIds).split(',').filter(Boolean);
    await pool.query('delete from policy_groups where policy_id=$1', [p.id]);
    for (const gid of gids) await pool.query('insert into policy_groups (policy_id, group_id) values ($1,$2) on conflict do nothing', [p.id, gid]);
  }
  if (prev.version !== p.version) await pool.query('insert into policy_versions (policy_id, version, note, changed_by) values ($1,$2,$3,$4)', [p.id, p.version, versionNote || ('Updated from ' + prev.version), req.user.name]);
  // delete the superseded file from the storage backend
  if (newFile && prev.upload_path && prev.upload_path !== p.upload_path) { await storage.remove(prev.upload_path); }
  await audit(req, 'training.update', p.name, { id: p.id });
  res.json(p);
});

// Archive a training (own only).
r.delete('/trainings/:id', requireManager, async (req, res) => {
  if (!(await canManage(req, req.params.id))) return res.status(403).json({ error: 'forbidden' });
  await pool.query('update policies set archived_at=now(), updated_at=now() where id=$1', [req.params.id]);
  await audit(req, 'training.archive', req.params.id);
  res.status(204).end();
});

// Serve an uploaded training file (any authenticated user who can read it).
r.get('/policies/:id/file', async (req, res) => {
  if (!(await canRead(req, req.params.id))) return res.status(403).json({ error: 'forbidden', detail: 'not assigned to you' });
  const p = (await pool.query('select upload_path, upload_name, upload_mime from policies where id=$1', [req.params.id])).rows[0];
  if (!p || !p.upload_path) return res.status(404).json({ error: 'no_file' });
  if (!(await storage.exists(p.upload_path))) return res.status(404).json({ error: 'missing_file' });
  // Content-Type is derived server-side from the stored extension (never the
  // client-supplied MIME), so an attacker can't have a file served as text/html.
  const ext = path.extname(p.upload_path).toLowerCase();
  res.setHeader('Content-Type', UPLOAD_TYPES[ext] || 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `inline; filename="${(p.upload_name || 'document').replace(/["\r\n]/g, '')}"`);
  const stream = storage.openReadStream(p.upload_path);
  stream.on('error', (e) => { if (req.log) req.log.error({ err: e.message }, 'file stream failed'); if (!res.headersSent) res.status(500).json({ error: 'read_failed' }); else res.destroy(e); });
  stream.pipe(res);
});
};
