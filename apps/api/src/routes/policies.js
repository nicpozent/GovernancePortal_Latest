// Generated from the former monolithic routes.js — handler bodies are verbatim.
const path = require('path');
const { pool } = require('../db');
const { requireAdmin } = require('../auth');
const { getPolicyDocument, getPolicyContentStream, resolveSharingUrl } = require('../services/sharepoint');
const { UPLOAD_TYPES } = require('../uploads');
const { isAdmin, audit, canRead } = require('../authz');

module.exports = (r) => {
// ── policies (employee sees groups they belong to; admin sees all) ──
r.get('/policies', async (req, res) => {
  const admin = isAdmin(req);

  // Required group membership drives visibility: an employee sees a policy
  // only if they are a member of at least one group the policy is assigned to.
  const sql = admin
    ? `select p.*, coalesce(array_agg(distinct g.name) filter (where g.id is not null), '{}') as groups
         from policies p
         left join policy_groups pg on pg.policy_id = p.id
         left join groups g on g.id = pg.group_id
        where p.archived_at is null
        group by p.id order by p.updated_at desc`
    : `select p.*, coalesce(array_agg(distinct g.name) filter (where g.id is not null), '{}') as groups,
              (case when p.due_date is not null then p.due_date
                    when p.due_days is not null then (greatest(p.created_at::date, me.created_at::date) + (p.due_days || ' days')::interval)::date
                    else null end) as personal_due,
              exists(select 1 from quizzes q where q.policy_id = p.id and q.archived_at is null) as has_quiz,
              (select count(*) from quiz_attempts a where a.policy_id = p.id and a.user_oid = $1)::int as quiz_attempts,
              coalesce((select bool_or(passed) from quiz_attempts a where a.policy_id = p.id and a.user_oid = $1), false) as quiz_passed,
              (select max(pct) from quiz_attempts a where a.policy_id = p.id and a.user_oid = $1) as quiz_best_pct
         from policies p
         cross join (select created_at from employees where oid = $1) me
         left join policy_groups pg on pg.policy_id = p.id
         left join groups g on g.id = pg.group_id
        where p.archived_at is null
          and (p.approved_externally or p.approval_state = 'published')
          and exists (
              select 1 from policy_groups x
                join (
                  select group_id, employee_oid from effective_group_membership
                ) em on em.group_id = x.group_id
               where x.policy_id = p.id and em.employee_oid = $1
            )
        group by p.id, me.created_at order by p.updated_at desc`;
  const rows = (await pool.query(sql, admin ? [] : [req.user.oid])).rows;

  // attach the current user's signature + computed status
  const sigs = (await pool.query(
    'select distinct on (policy_id) policy_id, policy_version, full_name, signed_at from signatures where user_oid = $1 order by policy_id, signed_at desc',
    [req.user.oid]
  )).rows;
  const byPid = Object.fromEntries(sigs.map((s) => [s.policy_id, s]));

  res.json(rows.map((p) => {
    const s = byPid[p.id];
    const status = !s ? 'pending' : s.policy_version === p.version ? 'signed' : 'outdated';
    return { ...p, signature: s || null, status };
  }));
});

// ── live document (preview URL + authoritative version) ──────
r.get('/policies/:id/document', async (req, res) => {
  if (!(await canRead(req, req.params.id))) return res.status(403).json({ error: 'forbidden', detail: 'not assigned to you' });
  const p = (await pool.query('select * from policies where id = $1', [req.params.id])).rows[0];
  if (!p) return res.status(404).json({ error: 'not_found' });
  if (!p.sharepoint_drive_id || !p.sharepoint_item_id) {
    return res.json({ webUrl: p.sharepoint_url, downloadUrl: null, version: p.version });
  }
  const doc = await getPolicyDocument(p.sharepoint_drive_id, p.sharepoint_item_id);
  res.json(doc);
});

// ── inline document bytes, proxied through our origin ────────
// Lets the SPA preview a SharePoint-hosted policy from a same-origin blob
// (CSP-safe), rather than embedding the external URL (blocked by SharePoint's
// X-Frame-Options). Authorization is the same read gate as /document.
r.get('/policies/:id/content', async (req, res) => {
  if (!(await canRead(req, req.params.id))) return res.status(403).json({ error: 'forbidden', detail: 'not assigned to you' });
  const p = (await pool.query('select sharepoint_drive_id, sharepoint_item_id from policies where id = $1', [req.params.id])).rows[0];
  if (!p) return res.status(404).json({ error: 'not_found' });
  if (!p.sharepoint_drive_id || !p.sharepoint_item_id) return res.status(404).json({ error: 'no_document', detail: 'This policy has no embedded document.' });
  let name = 'document';
  try { const meta = await getPolicyDocument(p.sharepoint_drive_id, p.sharepoint_item_id); if (meta && meta.name) name = meta.name; }
  catch (e) { return res.status(502).json({ error: 'sharepoint_unavailable', detail: e.message }); }
  // Office documents (Word/PowerPoint/Excel) can't render in an <iframe>, so ask
  // Graph to convert them to PDF; native PDFs/images stream as-is. Content-Type is
  // set server-side from the extension (never guessed from bytes).
  const ext = path.extname(name).toLowerCase();
  const asPdf = ['.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx'].includes(ext);
  res.setHeader('Content-Type', asPdf ? 'application/pdf' : (UPLOAD_TYPES[ext] || 'application/octet-stream'));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const outName = asPdf ? name.replace(/\.[^.]+$/, '.pdf') : name;
  res.setHeader('Content-Disposition', `inline; filename="${outName.replace(/["\r\n]/g, '')}"`);
  let stream;
  try { stream = await getPolicyContentStream(p.sharepoint_drive_id, p.sharepoint_item_id, asPdf); }
  catch (e) { if (req.log) req.log.error({ err: e.message }, 'sharepoint content fetch failed'); return res.status(502).json({ error: 'sharepoint_unavailable' }); }
  stream.on('error', (e) => { if (req.log) req.log.error({ err: e.message }, 'sharepoint content stream failed'); if (!res.headersSent) res.status(502).json({ error: 'read_failed' }); else res.destroy(e); });
  stream.pipe(res);
});

// ── policies CRUD (admin) — assigned to specific GROUPS ──────
r.post('/policies', requireAdmin, async (req, res) => {
  let { name, docType, version, sharepointUrl, sharepointDriveId, sharepointItemId, owner, ownerOid, groupIds, dueDate, dueDays, reviewDate } = req.body || {};
  // If only a link was provided, resolve it to drive/item ids.
  if (sharepointUrl && (!sharepointDriveId || !sharepointItemId)) {
    try { ({ driveId: sharepointDriveId, itemId: sharepointItemId } = await resolveSharingUrl(sharepointUrl)); }
    catch { /* keep link-only; document endpoint will fall back to webUrl */ }
  }
  // Owner defaults to the uploader; if an owner_oid is chosen, use that employee's name for display.
  // owner_oid is an FK to employees(oid): only keep it when the oid is a known
  // employee. An admin acting outside the directory-sync scope has no employees
  // row, so we store their display name but a NULL owner_oid (else the insert
  // fails the FK with a generic 500 — the reported "Save failed: server_error").
  let ownerName = owner || req.user.name;
  let oOid = ownerOid || req.user.oid;
  if (oOid) {
    const e = (await pool.query('select display_name from employees where oid=$1', [oOid])).rows[0];
    if (e) ownerName = e.display_name; else oOid = null;
  }
  const p = (await pool.query(
    `insert into policies (name, doc_type, version, sharepoint_url, sharepoint_drive_id, sharepoint_item_id, owner, owner_oid, due_date, due_days, review_date)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,
    [name, docType, version, sharepointUrl, sharepointDriveId || null, sharepointItemId || null, ownerName, oOid || null, dueDate || null, (dueDays || dueDays === 0) ? dueDays : null, reviewDate || null]
  )).rows[0];
  await pool.query('insert into policy_versions (policy_id, version, note, changed_by) values ($1,$2,$3,$4)', [p.id, p.version, 'Policy created', req.user.name]);
  for (const gid of groupIds || []) {
    await pool.query('insert into policy_groups (policy_id, group_id) values ($1,$2) on conflict do nothing', [p.id, gid]);
  }
  await audit(req, 'policy.create', p.name, { id: p.id, version: p.version });
  res.status(201).json(p);
});

r.put('/policies/:id', requireAdmin, async (req, res) => {
  const { name, docType, version, sharepointUrl, sharepointDriveId, sharepointItemId, owner, ownerOid, groupIds, dueDate, dueDays, reviewDate, versionNote } = req.body || {};
  const prev = (await pool.query('select version from policies where id=$1', [req.params.id])).rows[0];
  // Same owner_oid FK guard as create: keep the oid only when it is a known employee.
  let ownerName = owner;
  let oOid = ownerOid || null;
  if (oOid) {
    const e = (await pool.query('select display_name from employees where oid=$1', [oOid])).rows[0];
    if (e) ownerName = e.display_name; else oOid = null;
  }
  const p = (await pool.query(
    `update policies set name=$2, doc_type=$3, version=$4, sharepoint_url=$5, owner=$6,
            sharepoint_drive_id=coalesce($7, sharepoint_drive_id),
            sharepoint_item_id=coalesce($8, sharepoint_item_id),
            due_date=$9, due_days=$10, review_date=$11, owner_oid=$12, updated_at=now()
       where id=$1 returning *`,
    [req.params.id, name, docType, version, sharepointUrl, ownerName, sharepointDriveId || null, sharepointItemId || null, dueDate || null, (dueDays || dueDays === 0) ? dueDays : null, reviewDate || null, oOid]
  )).rows[0];
  if (!p) return res.status(404).json({ error: 'not_found' });
  if (prev && prev.version !== p.version) {
    await pool.query('insert into policy_versions (policy_id, version, note, changed_by) values ($1,$2,$3,$4)', [p.id, p.version, versionNote || ('Updated from ' + prev.version), req.user.name]);
  } else if (versionNote) {
    await pool.query('insert into policy_versions (policy_id, version, note, changed_by) values ($1,$2,$3,$4)', [p.id, p.version, versionNote, req.user.name]);
  }
  if (Array.isArray(groupIds)) {
    await pool.query('delete from policy_groups where policy_id=$1', [p.id]);
    for (const gid of groupIds) {
      await pool.query('insert into policy_groups (policy_id, group_id) values ($1,$2) on conflict do nothing', [p.id, gid]);
    }
  }
  await audit(req, 'policy.update', p.name, { id: p.id, version: p.version });
  res.json(p);
});

// ── archive (soft-delete) a policy — keeps the signature ledger intact ──
r.delete('/policies/:id', requireAdmin, async (req, res) => {
  const p = (await pool.query(
    `update policies set archived_at = now(), updated_at = now() where id = $1 and archived_at is null returning id`,
    [req.params.id])).rows[0];
  if (!p) return res.status(404).json({ error: 'not_found' });
  await audit(req, 'policy.archive', req.params.id);
  res.status(204).end();
});

// list archived policies (admin)
r.get('/policies-archived', requireAdmin, async (_req, res) => {
  res.json((await pool.query(
    `select p.*, coalesce(array_agg(distinct g.name) filter (where g.id is not null), '{}') as groups
       from policies p
       left join policy_groups pg on pg.policy_id = p.id
       left join groups g on g.id = pg.group_id
      where p.archived_at is not null
      group by p.id order by p.archived_at desc`)).rows);
});

// restore an archived policy (admin)
r.post('/policies/:id/restore', requireAdmin, async (req, res) => {
  await pool.query('update policies set archived_at = null, updated_at = now() where id = $1', [req.params.id]);
  await audit(req, 'policy.restore', req.params.id);
  res.status(204).end();
});

// ── policy version history (admin) ───────────────────────────
r.get('/policies/:id/versions', requireAdmin, async (req, res) => {
  res.json((await pool.query(
    'select version, note, changed_by, changed_at from policy_versions where policy_id=$1 order by changed_at desc',
    [req.params.id])).rows);
});
};
