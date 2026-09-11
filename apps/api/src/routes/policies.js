// Generated from the former monolithic routes.js — handler bodies are verbatim.
const path = require('path');
const crypto = require('crypto');
const { pool } = require('../db');
const { requireAdmin } = require('../auth');
const { getPolicyDocument, getPolicyContentStream, resolveSharingUrl } = require('../services/sharepoint');
const { UPLOAD_TYPES } = require('../uploads');
const storage = require('../storage');
const { isAdmin, audit, canRead, canManage } = require('../authz');

// Hash a readable stream (sha256) without buffering — used to verify a frozen
// revision's bytes still match what was recorded at freeze time.
const hashStream = (readable) => new Promise((resolve, reject) => {
  const h = crypto.createHash('sha256');
  readable.on('data', (c) => h.update(c));
  readable.on('error', reject);
  readable.on('end', () => resolve(h.digest('hex')));
});
const safeName = (s) => String(s || '').replace(/["\r\n]/g, '');

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
  // One transaction: the policy, its first version row and its group assignments
  // are written together, or not at all (a bad group id must not leave a
  // half-written policy with no version / partial assignment).
  const client = await pool.connect();
  let p;
  try {
    await client.query('begin');
    p = (await client.query(
      `insert into policies (name, doc_type, version, sharepoint_url, sharepoint_drive_id, sharepoint_item_id, owner, owner_oid, due_date, due_days, review_date)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,
      [name, docType, version, sharepointUrl, sharepointDriveId || null, sharepointItemId || null, ownerName, oOid || null, dueDate || null, (dueDays || dueDays === 0) ? dueDays : null, reviewDate || null]
    )).rows[0];
    await client.query('insert into policy_versions (policy_id, version, note, changed_by) values ($1,$2,$3,$4)', [p.id, p.version, 'Policy created', req.user.name]);
    for (const gid of groupIds || []) {
      await client.query('insert into policy_groups (policy_id, group_id) values ($1,$2) on conflict do nothing', [p.id, gid]);
    }
    await audit(req, 'policy.create', p.name, { id: p.id, version: p.version }, client);
    await client.query('commit');
  } catch (e) {
    try { await client.query('rollback'); } catch { /* ignore */ }
    if (req.log) req.log.error({ err: e.message }, 'policy create failed');
    return res.status(500).json({ error: 'server_error' });
  } finally { client.release(); }
  res.status(201).json(p);
});

r.put('/policies/:id', requireAdmin, async (req, res) => {
  const { name, docType, version, sharepointUrl, sharepointDriveId, sharepointItemId, owner, ownerOid, groupIds, dueDate, dueDays, reviewDate, versionNote } = req.body || {};
  const prev = (await pool.query('select version, approval_state, approved_externally, sharepoint_url, sharepoint_drive_id, sharepoint_item_id from policies where id=$1', [req.params.id])).rows[0];
  // Same owner_oid FK guard as create: keep the oid only when it is a known employee.
  let ownerName = owner;
  let oOid = ownerOid || null;
  if (oOid) {
    const e = (await pool.query('select display_name from employees where oid=$1', [oOid])).rows[0];
    if (e) ownerName = e.display_name; else oOid = null;
  }
  // One transaction: the policy update, any new version row, the group
  // reassignment (delete + re-insert) and the workflow reset apply atomically —
  // a failure part-way can't leave the policy with emptied groups or a stray
  // version row.
  const client = await pool.connect();
  let p, approvalReset = false;
  try {
    await client.query('begin');
    p = (await client.query(
      `update policies set name=$2, doc_type=$3, version=$4, sharepoint_url=$5, owner=$6,
              sharepoint_drive_id=coalesce($7, sharepoint_drive_id),
              sharepoint_item_id=coalesce($8, sharepoint_item_id),
              due_date=$9, due_days=$10, review_date=$11, owner_oid=$12, updated_at=now()
         where id=$1 returning *`,
      [req.params.id, name, docType, version, sharepointUrl, ownerName, sharepointDriveId || null, sharepointItemId || null, dueDate || null, (dueDays || dueDays === 0) ? dueDays : null, reviewDate || null, oOid]
    )).rows[0];
    if (!p) { await client.query('rollback'); return res.status(404).json({ error: 'not_found' }); }
    if (prev && prev.version !== p.version) {
      await client.query('insert into policy_versions (policy_id, version, note, changed_by) values ($1,$2,$3,$4)', [p.id, p.version, versionNote || ('Updated from ' + prev.version), req.user.name]);
    } else if (versionNote) {
      await client.query('insert into policy_versions (policy_id, version, note, changed_by) values ($1,$2,$3,$4)', [p.id, p.version, versionNote, req.user.name]);
    }
    if (Array.isArray(groupIds)) {
      await client.query('delete from policy_groups where policy_id=$1', [p.id]);
      for (const gid of groupIds) {
        await client.query('insert into policy_groups (policy_id, group_id) values ($1,$2) on conflict do nothing', [p.id, gid]);
      }
    }
    // Changing the governed CONTENT of a workflow-governed policy must force
    // re-approval, so it can't be published without an approval that covers what
    // it now points at. Content changes either the version string OR the
    // SharePoint document pointer (url / drive / item). Reset a live
    // (published/approved) policy back to draft in either case. Policies not under
    // the workflow (approved_externally = true — the default / break-glass) are
    // left published.
    const pointerChanged = !!prev && (
      p.sharepoint_url !== prev.sharepoint_url
      || p.sharepoint_drive_id !== prev.sharepoint_drive_id
      || p.sharepoint_item_id !== prev.sharepoint_item_id);
    // A content change invalidates the cached frozen revision: the next
    // acknowledgement must freeze the NEW content, and a same-label pointer swap
    // must not silently reuse the old revision (ADR-121 / #4).
    if (prev && (prev.version !== p.version || pointerChanged)) {
      await client.query('update policies set current_revision_id=null where id=$1', [p.id]);
      p.current_revision_id = null;
    }
    if (prev && (prev.version !== p.version || pointerChanged) && prev.approved_externally === false
        && ['published', 'approved'].includes(prev.approval_state)) {
      await client.query("update policies set approval_state='draft', updated_at=now() where id=$1", [p.id]);
      p.approval_state = 'draft';
      approvalReset = true;
    }
    if (approvalReset) await audit(req, 'policy.approval.reset_on_version', p.name, { id: p.id, version: p.version, from: prev.approval_state }, client);
    await audit(req, 'policy.update', p.name, { id: p.id, version: p.version }, client);
    await client.query('commit');
  } catch (e) {
    try { await client.query('rollback'); } catch { /* ignore */ }
    if (req.log) req.log.error({ err: e.message }, 'policy update failed');
    return res.status(500).json({ error: 'server_error' });
  } finally { client.release(); }
  res.json({ ...p, approvalReset });
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

// ── frozen content revisions (ADR-121) ───────────────────────
// The immutable, content-addressed snapshots employees acknowledged. Visible to
// the governor (admin / owner) — content provenance is not for arbitrary readers.
r.get('/policies/:id/revisions', async (req, res) => {
  if (!(await canManage(req, req.params.id))) return res.status(403).json({ error: 'forbidden' });
  const rows = (await pool.query(
    `select r.id, r.version_label, r.source, r.content_sha256, r.content_size, r.content_mime,
            r.integrity, r.frozen_at, r.frozen_by, (r.id = p.current_revision_id) as is_current,
            (select count(*)::int from signatures s where s.revision_id = r.id) as signatures
       from policy_revisions r join policies p on p.id = r.policy_id
      where r.policy_id = $1 order by r.frozen_at desc`, [req.params.id])).rows;
  res.json(rows);
});

// Verify a frozen revision's stored bytes still hash to what was recorded at
// freeze time — the tamper-evidence check an auditor asks for (admin / owner).
r.get('/policies/:id/revisions/:rev/verify', async (req, res) => {
  if (!(await canManage(req, req.params.id))) return res.status(403).json({ error: 'forbidden' });
  const rev = (await pool.query('select * from policy_revisions where id=$1 and policy_id=$2', [req.params.rev, req.params.id])).rows[0];
  if (!rev) return res.status(404).json({ error: 'not_found' });
  if (rev.integrity !== 'verified' || !rev.content_sha256 || !rev.upload_path) {
    return res.json({ ok: false, integrity: rev.integrity, detail: 'This is a legacy revision with no frozen bytes to verify.' });
  }
  if (!(await storage.exists(rev.upload_path))) return res.status(404).json({ error: 'missing_file', detail: 'The frozen content file is missing.' });
  try {
    const actual = await hashStream(storage.openReadStream(rev.upload_path));
    res.json({ ok: actual === rev.content_sha256, integrity: rev.integrity, expected: rev.content_sha256, actual, size: Number(rev.content_size) });
  } catch (e) { if (req.log) req.log.error({ err: e.message }, 'revision verify failed'); res.status(500).json({ error: 'verify_failed' }); }
});

// Serve the EXACT frozen bytes of a revision — to the governor, or to a user who
// actually acknowledged that revision (so they can re-open precisely what they
// signed). Content-Type is server-derived from the frozen key's extension.
r.get('/policies/:id/revisions/:rev/content', async (req, res) => {
  const rev = (await pool.query('select * from policy_revisions where id=$1 and policy_id=$2', [req.params.rev, req.params.id])).rows[0];
  if (!rev) return res.status(404).json({ error: 'not_found' });
  let allowed = await canManage(req, req.params.id);
  if (!allowed) {
    allowed = (await pool.query('select 1 from signatures where revision_id=$1 and user_oid=$2 limit 1', [rev.id, req.user.oid])).rowCount > 0;
  }
  if (!allowed) return res.status(403).json({ error: 'forbidden', detail: 'not your acknowledgement' });
  if (!rev.upload_path || !(await storage.exists(rev.upload_path))) return res.status(404).json({ error: 'missing_file' });
  const ext = path.extname(rev.upload_path).toLowerCase();
  res.setHeader('Content-Type', UPLOAD_TYPES[ext] || rev.content_mime || 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `inline; filename="revision-${safeName(rev.version_label)}${ext}"`);
  const stream = storage.openReadStream(rev.upload_path);
  stream.on('error', (e) => { if (req.log) req.log.error({ err: e.message }, 'revision content stream failed'); if (!res.headersSent) res.status(500).json({ error: 'read_failed' }); else res.destroy(e); });
  stream.pipe(res);
});
};
