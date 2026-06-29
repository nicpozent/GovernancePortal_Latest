// ============================================================
//  API routes — every route below requires a valid Entra token.
//  Maps 1:1 onto the prototype screens.
// ============================================================
const express = require('express');
const { pool } = require('./db');
const { requireAuth, requireAdmin, requireManager } = require('./auth');
const { logger, forwardEvent } = require('./logger');
const cfg = require('./config');
const { runSync } = require('./services/sync');
const { runReminders, sendMail } = require('./services/reminders');
const { getPolicyDocument, resolveSharingUrl, listLibraries, listFolder } = require('./services/sharepoint');
const { escapeHtml, isSafeHttpUrl, pgEnvFrom } = require('./util');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const BACKUP_DIR = '/backups';

const r = express.Router();

// Wrap async route handlers so a rejected promise becomes a clean 500
// (via the error handler) instead of an unhandledRejection that crashes
// the Node process. Middleware (3-arg, e.g. requireAdmin) is left as-is.
['get', 'post', 'put', 'delete', 'patch'].forEach((m) => {
  const orig = r[m].bind(r);
  r[m] = (path, ...handlers) =>
    orig(path, ...handlers.map((h) =>
      typeof h === 'function' && h.length < 3
        ? (req, res, next) => Promise.resolve(h(req, res, next)).catch(next)
        : h
    ));
});

r.use(requireAuth);

// Reject malformed UUID route params up front with a clean 400 instead of
// letting a Postgres cast error surface as a generic 500. (Queries are
// parameterized, so this is input hygiene — not an injection fix.)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidParam = (req, res, next, value) =>
  UUID_RE.test(value) ? next() : res.status(400).json({ error: 'bad_id' });
['id', 'oid', 'adId', 'pgId'].forEach((p) => r.param(p, uuidParam));

const isAdmin = (req) => req.user.roles.includes(cfg.adminAppRole);
const isManager = (req) => req.user.roles.includes(cfg.managerAppRole);
const UPLOAD_DIR = '/uploads';

// Append an admin audit entry (best-effort; never blocks the request).
// Also forwards the event to an external consumer if log-forwarding is enabled.
async function audit(req, action, target, detail) {
  const event = {
    at: new Date().toISOString(),
    actorOid: req.user && req.user.oid,
    actorName: req.user && req.user.name,
    action, target: target || null, detail: detail || null,
    ip: req.ip, requestId: req.id,
  };
  try {
    await pool.query(
      `insert into audit_log (actor_oid, actor_name, action, target, detail, ip)
       values ($1,$2,$3,$4,$5,$6)`,
      [event.actorOid, event.actorName, action, target || null, detail ? JSON.stringify(detail) : null, req.ip]
    );
  } catch (e) { (req.log || logger).error({ err: e.message }, 'audit insert failed'); }
  // Fire-and-forget outbound forward (never affects the request).
  (async () => {
    try {
      const cfgRow = (await pool.query('select forward_enabled, forward_url, forward_token from integration_config where id=1')).rows[0];
      if (!cfgRow || !cfgRow.forward_enabled) return;
      const out = await forwardEvent(cfgRow, { type: 'audit', ...event });
      await pool.query('update integration_config set last_forward_at=now(), last_forward_status=$1 where id=1',
        [out.ok ? 'ok' : (out.error || ('http ' + out.status))]);
    } catch (e) { (req.log || logger).warn({ err: e.message }, 'audit forward failed'); }
  })();
}

// ── whoami: drives the role switcher + persona chip ──────────
r.get('/me', async (req, res) => {
  const e = await pool.query('select * from employees where oid = $1', [req.user.oid]);
  res.json({
    identity: req.user,
    profile: e.rows[0] || null,
    isAdmin: isAdmin(req),
    isManager: isManager(req),
  });
});

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
          and exists (
              select 1 from policy_groups x
                join (
                  select eg.group_id, eg.employee_oid from employee_groups eg join groups gg on gg.id=eg.group_id and gg.archived_at is null
                  union
                  select gem.group_id, gem.employee_oid from group_effective_members gem join groups gg on gg.id=gem.group_id and gg.archived_at is null
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

// ── SIGN (the read-and-acknowledge flow) ─────────────────────
// Identity (oid, name) is taken from the verified token — not trusted from the client.
r.post('/signatures', async (req, res) => {
  const { policyId, fullName, acknowledged } = req.body || {};
  if (acknowledged !== true) return res.status(400).json({ error: 'must_acknowledge' });
  if (!fullName || !fullName.trim()) return res.status(400).json({ error: 'name_required' });

  const p = (await pool.query('select version from policies where id = $1', [policyId])).rows[0];
  if (!p) return res.status(404).json({ error: 'policy_not_found' });

  // If the policy has a quiz, the user must have passed it before signing.
  const quiz = (await pool.query('select id from quizzes where policy_id = $1 and archived_at is null', [policyId])).rows[0];
  if (quiz) {
    const passed = (await pool.query(
      'select 1 from quiz_attempts where policy_id = $1 and user_oid = $2 and passed limit 1', [policyId, req.user.oid])).rows[0];
    if (!passed) return res.status(403).json({ error: 'quiz_required', detail: 'You must pass the knowledge check before signing.' });
  }

  const ins = await pool.query(
    `insert into signatures (policy_id, policy_version, user_oid, full_name, acknowledged, ip_address, user_agent)
     values ($1, $2, $3, $4, true, $5, $6) returning *`,
    [policyId, p.version, req.user.oid, fullName.trim(), req.ip, req.headers['user-agent'] || null]
  );
  // Fire-and-forget confirmation email to the signer (no-op if mail isn't configured).
  (async () => {
    try {
      if (!cfg.graph.mailSender) return;
      const row = (await pool.query(
        `select pol.name as policy, pol.doc_type, coalesce(e.email, e.upn) as email, e.display_name
           from policies pol, employees e where pol.id = $1 and e.oid = $2`, [policyId, req.user.oid])).rows[0];
      if (!row || !row.email) return;
      const kind = escapeHtml((row.doc_type || 'document').toLowerCase());
      const when = escapeHtml(new Date().toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' }));
      const html = `<div style="font-family:Segoe UI,Arial,sans-serif;color:#23283a;line-height:1.6">
        <p>Hello ${escapeHtml(row.display_name || 'there')},</p>
        <p>This confirms you have read and acknowledged the ${kind} <strong>${escapeHtml(row.policy)}</strong> (${escapeHtml(p.version)}) on <strong>${when}</strong>.</p>
        <p>Signed as: ${escapeHtml(fullName.trim())}. This acknowledgement has been recorded in the Birgma Governance Portal.</p>
        ${cfg.frontendUrl ? `<p><a href="${cfg.frontendUrl}" style="background:#213a9e;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block">Open the Governance Portal</a></p>` : ''}
        <p style="color:#8a92a6;font-size:12px">Automated confirmation — please keep for your records.</p></div>`;
      await sendMail(row.email, `Acknowledgement confirmed: ${row.policy}`, html);
    } catch (e) { console.error('[sign-confirm] email failed:', e.message); }
  })();
  res.status(201).json(ins.rows[0]);
});

// ── signatures (mine, or everyone for admin) ─────────────────
r.get('/signatures', async (req, res) => {
  const rows = isAdmin(req)
    ? (await pool.query(
        `select s.*, p.name as policy_name, p.doc_type, e.display_name, e.department
           from signatures s join policies p on p.id = s.policy_id
           join employees e on e.oid = s.user_oid
          order by s.signed_at desc`
      )).rows
    : (await pool.query(
        `select s.*, p.name as policy_name, p.doc_type
           from signatures s join policies p on p.id = s.policy_id
          where s.user_oid = $1 order by s.signed_at desc`,
        [req.user.oid]
      )).rows;
  res.json(rows);
});

// ── employees (admin) ────────────────────────────────────────
r.get('/employees', requireAdmin, async (_req, res) => {
  res.json((await pool.query(
    `select e.*, fm.display_name as functional_manager_name
       from employees e
       left join employees fm on fm.oid = e.functional_manager_oid
      order by e.department, e.display_name`)).rows);
});

// set / clear the functional (real) manager (admin)
r.put('/employees/:oid/manager', requireAdmin, async (req, res) => {
  const { functionalManagerOid } = req.body || {};
  await pool.query('update employees set functional_manager_oid = $2 where oid = $1',
    [req.params.oid, functionalManagerOid || null]);
  await audit(req, 'employee.manager.set', req.params.oid, { functionalManagerOid: functionalManagerOid || null });
  res.status(204).end();
});

// bulk-import local users from CSV rows (admin) — optional; AD sync still primary
r.post('/employees/bulk', requireAdmin, async (req, res) => {
  const rows = Array.isArray(req.body && req.body.rows) ? req.body.rows : [];
  if (!rows.length) return res.status(400).json({ error: 'no_rows' });
  let added = 0, skipped = 0;
  for (const row of rows) {
    const first = (row.firstName || '').trim(), last = (row.lastName || '').trim();
    const display = (row.displayName || `${first} ${last}`).trim();
    const email = (row.email || '').trim();
    if (!display && !email) { skipped++; continue; }
    try {
      await pool.query(
        `insert into employees (oid, upn, email, display_name, job_title, department, source, synced_at)
         values (gen_random_uuid(), $1, $1, $2, $3, $4, 'Local', now())`,
        [email || 'user@birgma.com', display || email, (row.jobTitle || '').trim() || null, (row.department || '').trim() || 'Unassigned']
      );
      added++;
    } catch (e) { skipped++; }
  }
  await audit(req, 'employee.bulk_import', null, { added, skipped });
  res.json({ added, skipped });
});

// add a LOCAL user (admin) — source = 'Local'
r.post('/employees', requireAdmin, async (req, res) => {
  const { firstName, lastName, email, department, jobTitle } = req.body || {};
  const display = `${firstName || ''} ${lastName || ''}`.trim() || 'New User';
  const ins = await pool.query(
    `insert into employees (oid, upn, email, display_name, job_title, department, source, synced_at)
     values (gen_random_uuid(), $1, $1, $2, $3, $4, 'Local', now()) returning *`,
    [email || 'user@birgma.com', display, jobTitle || null, department || 'Unassigned']
  );
  await audit(req, 'employee.create.local', display, { email });
  res.status(201).json(ins.rows[0]);
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
  let ownerName = owner || req.user.name;
  const oOid = ownerOid || req.user.oid;
  if (oOid) { const e = (await pool.query('select display_name from employees where oid=$1', [oOid])).rows[0]; if (e) ownerName = e.display_name; }
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
  let ownerName = owner;
  if (ownerOid) { const e = (await pool.query('select display_name from employees where oid=$1', [ownerOid])).rows[0]; if (e) ownerName = e.display_name; }
  const p = (await pool.query(
    `update policies set name=$2, doc_type=$3, version=$4, sharepoint_url=$5, owner=$6,
            sharepoint_drive_id=coalesce($7, sharepoint_drive_id),
            sharepoint_item_id=coalesce($8, sharepoint_item_id),
            due_date=$9, due_days=$10, review_date=$11, owner_oid=$12, updated_at=now()
       where id=$1 returning *`,
    [req.params.id, name, docType, version, sharepointUrl, ownerName, sharepointDriveId || null, sharepointItemId || null, dueDate || null, (dueDays || dueDays === 0) ? dueDays : null, reviewDate || null, ownerOid || null]
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

// ── MANAGER: team scope (only their own reports) ─────────────
// A manager's team = active employees whose functional manager is them,
// OR whose directory (legal) manager email matches the manager's email/upn.
async function teamOids(managerOid) {
  const m = (await pool.query('select email, upn from employees where oid=$1', [managerOid])).rows[0] || {};
  const r = await pool.query(
    `select oid from employees
      where status='Active'
        and (functional_manager_oid = $1
             or (manager_email is not null and lower(manager_email) in (lower($2), lower($3))))`,
    [managerOid, m.email || '~none~', m.upn || '~none~']);
  return r.rows.map((x) => x.oid);
}

// Manager dashboard: compliance for the manager's team across policies + trainings.
r.get('/manager/dashboard', requireManager, async (req, res) => {
  const oids = await teamOids(req.user.oid);
  if (!oids.length) return res.json({ team: [], items: [], summary: { people: 0, compliant: 0, assigned: 0, signed: 0, pct: 0 } });
  const q = await pool.query(`
    with team as (select oid from employees where oid = any($1::uuid[])),
    eff as (
      select eg.group_id, eg.employee_oid as oid from employee_groups eg join groups gg on gg.id=eg.group_id and gg.archived_at is null
      union
      select gem.group_id, gem.employee_oid as oid from group_effective_members gem join groups gg on gg.id=gem.group_id and gg.archived_at is null
    ),
    required as (
      select distinct pg.policy_id, t.oid
        from policy_groups pg
        join policies p on p.id=pg.policy_id and p.archived_at is null
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

// ── TRAININGS (manager-owned, locally uploaded) ──────────────
// A training is a policy with doc_type='Training', source='Upload',
// and a file stored on the /uploads volume. Managers manage ONLY
// their own trainings; admins can manage all.
// Allowlist: extension -> safe, server-determined Content-Type. Anything not
// here is rejected at upload, and HTML/SVG/scripts can never be stored or served.
const UPLOAD_TYPES = {
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
};
const uploadMw = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => { const ext = path.extname(file.originalname || '').toLowerCase().slice(0, 12); cb(null, crypto.randomUUID() + ext); },
  }),
  limits: { fileSize: 250 * 1024 * 1024 },   // 250 MB cap
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (UPLOAD_TYPES[ext]) return cb(null, true);
    cb(new Error('Unsupported file type. Allowed: PDF, video (mp4/webm), PowerPoint, Word, image.'));
  },
}).single('file');
// Wrap multer so its errors return JSON instead of crashing the handler.
const withUpload = (req, res, next) => uploadMw(req, res, (err) => {
  if (err) return res.status(400).json({ error: 'upload_failed', detail: err.message });
  next();
});

// Can the caller manage this policy/training? admin = always; manager = only own.
async function canManage(req, policyId) {
  if (isAdmin(req)) return true;
  if (!isManager(req)) return false;
  const p = (await pool.query('select owner_oid from policies where id=$1', [policyId])).rows[0];
  return !!p && p.owner_oid === req.user.oid;
}

// Can the caller READ this policy/document? admin or owner = always; otherwise
// the policy must apply to them: either it has NO group assignment (applies to
// everyone) or they are an effective member of one of its assigned groups.
async function canRead(req, policyId) {
  if (isAdmin(req)) return true;
  const p = (await pool.query('select owner_oid from policies where id=$1', [policyId])).rows[0];
  if (!p) return false;
  if (p.owner_oid && p.owner_oid === req.user.oid) return true;
  const r = await pool.query(`
    select 1
     where exists (
          select 1 from policy_groups x
            join (
              select eg.group_id, eg.employee_oid from employee_groups eg join groups gg on gg.id=eg.group_id and gg.archived_at is null
              union
              select gem.group_id, gem.employee_oid from group_effective_members gem join groups gg on gg.id=gem.group_id and gg.archived_at is null
            ) em on em.group_id = x.group_id
           where x.policy_id = $1 and em.employee_oid = $2
        )
    limit 1`, [policyId, req.user.oid]);
  return r.rowCount > 0;
}

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
      select eg.group_id, eg.employee_oid as oid from employee_groups eg join groups gg on gg.id=eg.group_id and gg.archived_at is null
      union
      select gem.group_id, gem.employee_oid as oid from group_effective_members gem join groups gg on gg.id=gem.group_id and gg.archived_at is null
    ) em join employees e on e.oid=em.oid and e.status='Active'
     where em.group_id = any($1::uuid[])`, [ids]);
  res.json({ count: r.rows[0].count });
});

// Document types a manager may upload.
const MGR_DOC_TYPES = ['Policy', 'Process', 'Procedure', 'Standard', 'Guideline', 'Training'];

// List the manager's own uploaded documents (admins see all uploads).
r.get('/trainings', requireManager, async (req, res) => {
  const mine = isAdmin(req) ? '' : 'and p.owner_oid = $1';
  const params = isAdmin(req) ? [] : [req.user.oid];
  res.json((await pool.query(
    `with eff as (
       select eg.group_id, eg.employee_oid as oid from employee_groups eg join groups gg on gg.id=eg.group_id and gg.archived_at is null
       union
       select gem.group_id, gem.employee_oid as oid from group_effective_members gem join groups gg on gg.id=gem.group_id and gg.archived_at is null
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
  const p = (await pool.query(
    `insert into policies (name, doc_type, version, sharepoint_url, owner, owner_oid, source, upload_path, upload_name, upload_mime, due_date, due_days, review_date)
     values ($1,$2,$3,'',$4,$5,'Upload',$6,$7,$8,$9,$10,$11) returning *`,
    [name.trim(), docType, version || 'v1.0', req.user.name, req.user.oid, req.file.filename, req.file.originalname, req.file.mimetype,
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
  const p = (await pool.query(
    `update policies set name=$2, doc_type=$3, version=$4, due_date=$5, due_days=$6, review_date=$7,
        upload_path=coalesce($8, upload_path), upload_name=coalesce($9, upload_name), upload_mime=coalesce($10, upload_mime),
        updated_at=now()
      where id=$1 returning *`,
    [req.params.id, name, docType, version, dueDate || null, (dueDays!==undefined && dueDays!=='') ? parseInt(dueDays,10) : null, reviewDate || null,
     newFile ? newFile.filename : null, newFile ? newFile.originalname : null, newFile ? newFile.mimetype : null]
  )).rows[0];
  if (Array.isArray(groupIds) || typeof groupIds === 'string') {
    const gids = Array.isArray(groupIds) ? groupIds : String(groupIds).split(',').filter(Boolean);
    await pool.query('delete from policy_groups where policy_id=$1', [p.id]);
    for (const gid of gids) await pool.query('insert into policy_groups (policy_id, group_id) values ($1,$2) on conflict do nothing', [p.id, gid]);
  }
  if (prev.version !== p.version) await pool.query('insert into policy_versions (policy_id, version, note, changed_by) values ($1,$2,$3,$4)', [p.id, p.version, versionNote || ('Updated from ' + prev.version), req.user.name]);
  // delete the superseded file
  if (newFile && prev.upload_path && prev.upload_path !== p.upload_path) { try { fs.unlinkSync(path.join(UPLOAD_DIR, prev.upload_path)); } catch (_) {} }
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
  const full = path.join(UPLOAD_DIR, path.basename(p.upload_path));
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'missing_file' });
  // Content-Type is derived server-side from the stored extension (never the
  // client-supplied MIME), so an attacker can't have a file served as text/html.
  const ext = path.extname(p.upload_path).toLowerCase();
  res.setHeader('Content-Type', UPLOAD_TYPES[ext] || 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `inline; filename="${(p.upload_name || 'document').replace(/["\r\n]/g, '')}"`);
  fs.createReadStream(full).pipe(res);
});

// ── QUIZZES (knowledge checks) ───────────────────────────────
// Get the quiz for a policy. Admin sees correct answers + points;
// employees get the questions only, plus their own attempt history.
r.get('/policies/:id/quiz', async (req, res) => {
  const admin = isAdmin(req) || (await canManage(req, req.params.id));
  if (!admin && !(await canRead(req, req.params.id))) return res.status(403).json({ error: 'forbidden', detail: 'not assigned to you' });
  const quiz = (await pool.query('select * from quizzes where policy_id = $1', [req.params.id])).rows[0];
  if (!quiz) return res.json({ quiz: null });
  if (!admin && quiz.archived_at) return res.json({ quiz: null });   // archived → no gate for employees
  const qs = (await pool.query('select * from quiz_questions where quiz_id = $1 order by position, id', [quiz.id])).rows;
  const questions = qs.map((q) => admin
    ? { id: q.id, prompt: q.prompt, options: q.options, correctIndex: q.correct_index, points: q.points }
    : { id: q.id, prompt: q.prompt, options: q.options, points: q.points });
  let attempts = [];
  if (!admin) {
    attempts = (await pool.query(
      'select attempt_no, score, max_score, pct, passed, at from quiz_attempts where policy_id = $1 and user_oid = $2 order by attempt_no',
      [req.params.id, req.user.oid])).rows;
  }
  res.json({ quiz: { id: quiz.id, title: quiz.title, passPct: quiz.pass_pct, archived: !!quiz.archived_at }, questions, attempts, attemptsUsed: attempts.length, maxAttempts: cfg.quizMaxAttempts, passed: attempts.some((a) => a.passed) });
});

// Create or replace the quiz for a policy (admin, or manager who owns it).
r.post('/policies/:id/quiz', requireManager, async (req, res) => {
  if (!(await canManage(req, req.params.id))) return res.status(403).json({ error: 'forbidden' });
  const { title, passPct, questions } = req.body || {};
  if (!Array.isArray(questions) || !questions.length) return res.status(400).json({ error: 'no_questions' });
  const quiz = (await pool.query(
    `insert into quizzes (policy_id, title, pass_pct) values ($1, $2, $3)
     on conflict (policy_id) do update set title = excluded.title, pass_pct = excluded.pass_pct, archived_at = null, updated_at = now()
     returning *`,
    [req.params.id, (title || 'Knowledge check').trim(), Math.min(100, Math.max(1, parseInt(passPct, 10) || 80))])).rows[0];
  await pool.query('delete from quiz_questions where quiz_id = $1', [quiz.id]);
  let pos = 0;
  for (const q of questions) {
    const opts = Array.isArray(q.options) ? q.options.filter((o) => String(o).trim().length) : [];
    if (!q.prompt || !q.prompt.trim() || opts.length < 2) continue;
    await pool.query(
      `insert into quiz_questions (quiz_id, position, prompt, options, correct_index, points)
       values ($1,$2,$3,$4,$5,$6)`,
      [quiz.id, pos++, q.prompt.trim(), JSON.stringify(opts), Math.min(opts.length - 1, Math.max(0, parseInt(q.correctIndex, 10) || 0)), Math.max(1, parseInt(q.points, 10) || 1)]);
  }
  await audit(req, 'quiz.save', req.params.id, { questions: pos, passPct: quiz.pass_pct });
  res.status(201).json({ ok: true, questions: pos });
});

// Archive / restore the quiz for a policy (admin).
r.post('/policies/:id/quiz/archive', requireManager, async (req, res) => {
  if (!(await canManage(req, req.params.id))) return res.status(403).json({ error: 'forbidden' });
  await pool.query('update quizzes set archived_at = now() where policy_id = $1', [req.params.id]);
  await audit(req, 'quiz.archive', req.params.id);
  res.status(204).end();
});
r.post('/policies/:id/quiz/restore', requireManager, async (req, res) => {
  if (!(await canManage(req, req.params.id))) return res.status(403).json({ error: 'forbidden' });
  await pool.query('update quizzes set archived_at = null where policy_id = $1', [req.params.id]);
  await audit(req, 'quiz.restore', req.params.id);
  res.status(204).end();
});

// Delete the quiz for a policy (admin, or manager who owns it).
r.delete('/policies/:id/quiz', requireManager, async (req, res) => {
  if (!(await canManage(req, req.params.id))) return res.status(403).json({ error: 'forbidden' });
  await pool.query('delete from quizzes where policy_id = $1', [req.params.id]);
  await audit(req, 'quiz.delete', req.params.id);
  res.status(204).end();
});

// Submit a quiz attempt (employee) — graded server-side.
r.post('/policies/:id/quiz/attempt', async (req, res) => {
  if (!(await canRead(req, req.params.id))) return res.status(403).json({ error: 'forbidden', detail: 'not assigned to you' });
  const answers = (req.body && req.body.answers) || {};
  const quiz = (await pool.query('select * from quizzes where policy_id = $1 and archived_at is null', [req.params.id])).rows[0];
  if (!quiz) return res.status(404).json({ error: 'no_quiz' });

  // Grading is a pure read of the question set — do it before the lock.
  const qs = (await pool.query('select id, prompt, correct_index, points from quiz_questions where quiz_id = $1', [quiz.id])).rows;
  let score = 0, max = 0; const review = [];
  for (const q of qs) {
    max += q.points;
    const chosen = Number(answers[q.id]);
    const correct = chosen === q.correct_index;
    if (correct) score += q.points;
    review.push({ id: q.id, prompt: q.prompt, chosen: isNaN(chosen) ? null : chosen, correctIndex: q.correct_index, correct, points: q.points });
  }
  const pct = max ? Math.round((score / max) * 100) : 0;
  const passed = pct >= quiz.pass_pct;

  // The "already-passed / attempts-left" check and the insert must be atomic,
  // or concurrent submissions could exceed the cap. Serialize per (user, policy)
  // with a transaction-scoped advisory lock.
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [`${req.user.oid}:${req.params.id}`]);
    const prior = (await client.query(
      'select attempt_no, passed from quiz_attempts where policy_id = $1 and user_oid = $2 order by attempt_no',
      [req.params.id, req.user.oid])).rows;
    if (prior.some((a) => a.passed)) { await client.query('rollback'); return res.status(409).json({ error: 'already_passed' }); }
    if (prior.length >= cfg.quizMaxAttempts) { await client.query('rollback'); return res.status(403).json({ error: 'no_attempts_left', detail: 'No attempts remaining. Contact your administrator.' }); }
    const attemptNo = prior.length + 1;
    await client.query(
      `insert into quiz_attempts (quiz_id, policy_id, user_oid, attempt_no, score, max_score, pct, passed, answers)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [quiz.id, req.params.id, req.user.oid, attemptNo, score, max, pct, passed, JSON.stringify(answers)]);
    await client.query('commit');
    await audit(req, 'quiz.attempt', req.params.id, { attemptNo, pct, passed });
    res.json({ score, maxScore: max, pct, passed, attemptNo, remaining: Math.max(0, cfg.quizMaxAttempts - attemptNo), passPct: quiz.pass_pct, review });
  } catch (e) {
    try { await client.query('rollback'); } catch (_) {}
    throw e;
  } finally {
    client.release();
  }
});

// Quiz analytics for admins — attempts, pass rate, per-question difficulty.
r.get('/policies/:id/quiz/analytics', requireManager, async (req, res) => {
  if (!(await canManage(req, req.params.id))) return res.status(403).json({ error: 'forbidden' });
  const quiz = (await pool.query('select * from quizzes where policy_id = $1', [req.params.id])).rows[0];
  if (!quiz) return res.json({ quiz: null });
  const att = (await pool.query(
    `select count(*)::int as attempts, count(distinct user_oid)::int as people,
            count(*) filter (where passed)::int as passes,
            count(distinct user_oid) filter (where passed)::int as people_passed,
            round(avg(pct))::int as avg_pct
       from quiz_attempts where policy_id = $1`, [req.params.id])).rows[0];
  const qs = (await pool.query('select id, prompt, points, correct_index from quiz_questions where quiz_id = $1 order by position, id', [quiz.id])).rows;
  // per-question correct rate across all attempts
  const attempts = (await pool.query('select answers from quiz_attempts where policy_id = $1', [req.params.id])).rows;
  const perQ = qs.map((q) => {
    let correct = 0, answered = 0;
    for (const a of attempts) { const v = a.answers && a.answers[q.id]; if (v !== undefined && v !== null) { answered++; if (Number(v) === q.correct_index) correct++; } }
    return { prompt: q.prompt, points: q.points, answered, correct, rate: answered ? Math.round(correct / answered * 100) : null };
  });
  res.json({ quiz: { title: quiz.title, passPct: quiz.pass_pct }, summary: att, questions: perQ });
});

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

// ── trigger directory sync (admin) ───────────────────────────
r.post('/sync', requireAdmin, async (req, res) => {
  try {
    const out = await runSync();
    await audit(req, 'directory.sync', 'Entra ID', out);
    res.json({ status: 'success', ...out });
  } catch (e) {
    res.status(502).json({ status: 'error', error: e.message });
  }
});

// ── last directory sync status (admin) ───────────────────────
r.get('/sync/status', requireAdmin, async (_req, res) => {
  const row = (await pool.query(
    `select source, started_at, finished_at, added, updated, status, error
       from sync_runs order by started_at desc limit 1`)).rows[0];
  res.json(row || null);
});

// ── policy version history (admin) ───────────────────────────
r.get('/policies/:id/versions', requireAdmin, async (req, res) => {
  res.json((await pool.query(
    'select version, note, changed_by, changed_at from policy_versions where policy_id=$1 order by changed_at desc',
    [req.params.id])).rows);
});

// ── former employees (leavers) — signatures retained (admin) ─
r.get('/employees/former', requireAdmin, async (_req, res) => {
  res.json((await pool.query(
    `select e.oid, e.display_name, e.email, e.upn, e.department, e.status, e.deactivated_at, e.synced_at,
            (select count(*) from signatures s where s.user_oid = e.oid)::int as signatures
       from employees e
      where e.status <> 'Active'
      order by e.deactivated_at desc nulls last, e.display_name`)).rows);
});

// ── manual database backup (admin) — streams a pg_dump download ──
r.get('/admin/backup', requireAdmin, async (req, res) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  res.setHeader('Content-Type', 'application/sql');
  res.setHeader('Content-Disposition', `attachment; filename="governance-backup-${stamp}.sql"`);
  const dump = spawn('pg_dump', ['--no-owner', '--clean', '--if-exists'], { env: pgEnvFrom(cfg.databaseUrl, process.env) });
  dump.stdout.pipe(res);
  let errOut = '';
  dump.stderr.on('data', (d) => { errOut += d.toString(); });
  dump.on('error', (e) => { console.error('[backup] spawn failed:', e.message); if (!res.headersSent) res.status(500).json({ error: 'backup_failed', detail: e.message }); });
  dump.on('close', (code) => {
    if (code !== 0) { console.error('[backup] pg_dump exit', code, errOut); if (!res.headersSent) res.status(500).json({ error: 'backup_failed', detail: errOut.slice(0, 300) }); }
    audit(req, 'admin.backup', null, { code });
  });
});

// ── list server-stored backups (admin) ──
r.get('/admin/backups', requireAdmin, async (_req, res) => {
  let files = [];
  try {
    files = fs.readdirSync(BACKUP_DIR)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => { const st = fs.statSync(path.join(BACKUP_DIR, f)); return { name: f, size: st.size, at: st.mtime }; })
      .sort((a, b) => b.at - a.at);
  } catch (e) { /* dir may not exist yet */ }
  res.json(files);
});

// ── create a backup on the server now (admin) ──
r.post('/admin/backups', requireAdmin, async (req, res) => {
  try { if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true }); }
  catch (e) { return res.status(500).json({ error: 'backup_failed', detail: 'no backups dir' }); }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = path.join(BACKUP_DIR, `governance-${stamp}.sql`);
  const out = fs.createWriteStream(file);
  const dump = spawn('pg_dump', ['--no-owner', '--clean', '--if-exists'], { env: pgEnvFrom(cfg.databaseUrl, process.env) });
  let errOut = '';
  dump.stdout.pipe(out);
  dump.stderr.on('data', (d) => { errOut += d.toString(); });
  dump.on('error', (e) => { console.error('[backup] spawn failed:', e.message); if (!res.headersSent) res.status(500).json({ error: 'backup_failed', detail: e.message }); });
  dump.on('close', (code) => {
    if (code !== 0) { try { fs.unlinkSync(file); } catch (_) {} console.error('[backup] exit', code, errOut); return res.status(500).json({ error: 'backup_failed', detail: errOut.slice(0, 300) }); }
    let size = 0; try { size = fs.statSync(file).size; } catch (_) {}
    audit(req, 'admin.backup.server', `governance-${stamp}.sql`, { size });
    res.status(201).json({ name: `governance-${stamp}.sql`, size });
  });
});

// ── download a specific stored backup (admin) ──
r.get('/admin/backups/:name', requireAdmin, async (req, res) => {
  const name = path.basename(req.params.name);   // prevent path traversal
  if (!/^[\w.\-]+\.sql$/.test(name)) return res.status(400).json({ error: 'bad_name' });
  const file = path.join(BACKUP_DIR, name);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'not_found' });
  res.setHeader('Content-Type', 'application/sql');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  fs.createReadStream(file).pipe(res);
});

// ── send reminder emails now (admin) ─────────────────────────
r.post('/reminders/run', requireAdmin, async (req, res) => {
  try { const out = await runReminders(); await audit(req, 'reminders.run', null, out); res.json({ status: 'success', ...out }); }
  catch (e) { res.status(502).json({ status: 'error', error: e.message }); }
});

// ── integrations: log forwarding (push) + consumer feed (pull) ──
r.get('/integrations', requireAdmin, async (_req, res) => {
  const c = (await pool.query('select * from integration_config where id=1')).rows[0] || {};
  // Never return the stored secrets in full — only whether they're set.
  res.json({
    forwardEnabled: !!c.forward_enabled,
    forwardUrl: c.forward_url || '',
    forwardTokenSet: !!c.forward_token,
    feedEnabled: !!c.feed_enabled,
    feedKeySet: !!c.feed_api_key,
    lastForwardAt: c.last_forward_at,
    lastForwardStatus: c.last_forward_status,
  });
});
r.put('/integrations', requireAdmin, async (req, res) => {
  const { forwardEnabled, forwardUrl, forwardToken, feedEnabled } = req.body || {};
  // Reject loopback/link-local/non-http(s) forward targets up front (anti-SSRF).
  if (forwardUrl && !isSafeHttpUrl(forwardUrl)) {
    return res.status(400).json({ error: 'bad_url', detail: 'Forward URL must be http(s) and not a loopback/link-local address.' });
  }
  // forwardToken: undefined = leave as-is, '' = clear, string = set.
  await pool.query(
    `update integration_config set
       forward_enabled=$1, forward_url=$2,
       forward_token = case when $3::text is null then forward_token else nullif($3,'') end,
       feed_enabled=$4, updated_at=now() where id=1`,
    [!!forwardEnabled, forwardUrl || null, (forwardToken === undefined ? null : forwardToken), !!feedEnabled]);
  await audit(req, 'integration.update', null, { forwardEnabled: !!forwardEnabled, feedEnabled: !!feedEnabled });
  res.json({ ok: true });
});
// Generate (or rotate) the consumer feed API key — returned ONCE.
r.post('/integrations/feed-key', requireAdmin, async (req, res) => {
  const key = 'gov_' + crypto.randomBytes(24).toString('hex');
  await pool.query('update integration_config set feed_api_key=$1, feed_enabled=true where id=1', [key]);
  await audit(req, 'integration.feed_key.rotate', null, null);
  res.json({ apiKey: key });   // shown once; only a hash-of-presence is exposed afterwards
});
// Send a test event to the configured forward URL.
r.post('/integrations/test', requireAdmin, async (req, res) => {
  const c = (await pool.query('select forward_url, forward_token, forward_enabled from integration_config where id=1')).rows[0];
  if (!c || !c.forward_url) return res.status(400).json({ error: 'no_url', detail: 'Set a forward URL first.' });
  const out = await forwardEvent({ ...c, forward_enabled: true }, {
    type: 'test', at: new Date().toISOString(), action: 'integration.test',
    actorName: req.user.name, message: 'Birgma Governance test event',
  });
  await pool.query('update integration_config set last_forward_at=now(), last_forward_status=$1 where id=1',
    [out.ok ? 'ok' : (out.error || ('http ' + out.status))]);
  res.json(out);
});

// ── admin audit log (read) ───────────────────────────────────
r.get('/audit', requireAdmin, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);
  res.json((await pool.query('select * from audit_log order by at desc limit $1', [limit])).rows);
});

// ── compliance dashboard aggregates (admin) ──────────────────
// "required" = active employees who are members of ANY group the policy
//   is assigned to (counted once, even if in several matching groups).
// "signed"   = those who signed the CURRENT version.
r.get('/dashboard', requireAdmin, async (_req, res) => {
  const rows = (await pool.query(`
    with eff_members as (
      select eg.group_id, eg.employee_oid as oid from employee_groups eg join groups gg on gg.id = eg.group_id and gg.archived_at is null
      union
      select gem.group_id, gem.employee_oid as oid from group_effective_members gem join groups gg on gg.id = gem.group_id and gg.archived_at is null
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
      select eg.group_id, eg.employee_oid as oid from employee_groups eg join groups gg on gg.id = eg.group_id and gg.archived_at is null
      union
      select gem.group_id, gem.employee_oid as oid from group_effective_members gem join groups gg on gg.id = gem.group_id and gg.archived_at is null
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
      select eg.group_id, eg.employee_oid as oid from employee_groups eg join groups gg on gg.id = eg.group_id and gg.archived_at is null
      union
      select gem.group_id, gem.employee_oid as oid from group_effective_members gem join groups gg on gg.id = gem.group_id and gg.archived_at is null
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
      select eg.group_id, eg.employee_oid as oid from employee_groups eg join groups gg on gg.id = eg.group_id and gg.archived_at is null
      union
      select gem.group_id, gem.employee_oid as oid from group_effective_members gem join groups gg on gg.id = gem.group_id and gg.archived_at is null
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
      select eg.group_id, eg.employee_oid as oid from employee_groups eg join groups gg on gg.id = eg.group_id and gg.archived_at is null
      union
      select gem.group_id, gem.employee_oid as oid from group_effective_members gem join groups gg on gg.id = gem.group_id and gg.archived_at is null
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

// ── browse the SharePoint policy library (admin) — powers the file picker ──
// No ?drive → returns the list of document libraries. ?drive=<id>&path=<rel> → folder contents.
r.get('/sharepoint/browse', requireAdmin, async (req, res) => {
  try {
    const { drive, path } = req.query;
    if (!drive) {
      const items = await listLibraries();
      return res.json({ level: 'libraries', path: '', items });
    }
    const out = await listFolder(drive, path || '');
    res.json({ level: 'folder', ...out });
  } catch (e) {
    console.error('[sharepoint/browse] failed:', e.statusCode || '', e.code || '', e.message);
    res.status(502).json({ error: 'sharepoint_browse_failed', detail: e.message });
  }
});

module.exports = r;
