// ============================================================
//  Confidential documents + share requests (finding #17).
//
//  A document can be marked CONFIDENTIAL by its owner or an admin; the marker
//  becomes its "gatekeeper". Once confidential, EXPANDING who it reaches (adding
//  recipient groups) by anyone other than the gatekeeper or an admin is blocked
//  and must go through a SHARE REQUEST that the gatekeeper approves — a light
//  request/approve flow (cf. ADR-120). Removing recipients, and any change by the
//  gatekeeper/admin, are unaffected.
// ============================================================
const { pool } = require('../db');
const cfg = require('../config');
const { isAdmin, audit, canManage } = require('../authz');
const { sendMail } = require('../services/reminders');
const { escapeHtml } = require('../util');

// Best-effort, non-blocking notification (no-op unless mail is configured).
const notify = (fn) => { Promise.resolve().then(fn).catch(() => {}); };
async function emailUser(oid, subject, bodyLine) {
  if (!cfg.graph.mailSender || !oid) return;
  const e = (await pool.query('select coalesce(email, upn) as email, display_name from employees where oid=$1', [oid])).rows[0];
  if (!e || !e.email) return;
  const link = cfg.frontendUrl || '';
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;color:#23283a;line-height:1.6">
    <p>Hello ${escapeHtml(e.display_name || 'there')},</p><p>${bodyLine}</p>
    ${link ? `<p><a href="${link}" style="background:#213a9e;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block">Open the Governance Portal</a></p>` : ''}
    <p style="color:#8a92a6;font-size:12px">Automated notification from the Birgma Governance Portal.</p></div>`;
  await sendMail(e.email, subject, html);
}

// Enforcement helper used by the policy/training editors: on a confidential
// document, block additions to the recipient set by a non-gatekeeper/non-admin.
// Returns { ok:true } to allow, or { ok:false, added:[...] } to block. Removal-only
// changes (no new groups) and any change by the gatekeeper/admin are allowed.
async function guardConfidentialShare(req, policy, desiredGroupIds, db = pool) {
  if (!policy || !policy.confidential) return { ok: true };
  const isGatekeeper = policy.confidential_by && policy.confidential_by === req.user.oid;
  if (isAdmin(req) || isGatekeeper) return { ok: true };
  const current = new Set((await db.query('select group_id from policy_groups where policy_id=$1', [policy.id])).rows.map((r) => r.group_id));
  const added = [...new Set((desiredGroupIds || []).filter(Boolean))].filter((g) => !current.has(g));
  return added.length ? { ok: false, added } : { ok: true };
}

module.exports = (r) => {
  // ── mark / unmark confidential ──
  // Mark: owner or admin. Unmark: only the gatekeeper (confidential_by) or admin,
  // so a manager can't quietly strip another's protection off a shared document.
  r.post('/policies/:id/confidential', async (req, res) => {
    const want = !!(req.body && req.body.confidential);
    const p = (await pool.query('select id, name, owner_oid, confidential, confidential_by from policies where id=$1', [req.params.id])).rows[0];
    if (!p) return res.status(404).json({ error: 'not_found' });
    if (want) {
      if (!(await canManage(req, p.id))) return res.status(403).json({ error: 'forbidden' });
      if (p.confidential) return res.json({ ok: true, confidential: true, confidential_by: p.confidential_by });
      const upd = (await pool.query(
        "update policies set confidential=true, confidential_by=$2, confidential_at=now(), updated_at=now() where id=$1 returning confidential_by", [p.id, req.user.oid])).rows[0];
      await audit(req, 'policy.confidential.mark', p.name, { id: p.id });
      return res.json({ ok: true, confidential: true, confidential_by: upd.confidential_by });
    }
    // unmark
    const isGatekeeper = p.confidential_by && p.confidential_by === req.user.oid;
    if (!isAdmin(req) && !isGatekeeper) return res.status(403).json({ error: 'forbidden', detail: 'Only the person who marked this confidential (or an admin) can remove it.' });
    await pool.query("update policies set confidential=false, confidential_by=null, confidential_at=null, updated_at=now() where id=$1", [p.id]);
    await audit(req, 'policy.confidential.unmark', p.name, { id: p.id });
    res.json({ ok: true, confidential: false });
  });

  // ── file a share request (a manager who owns the doc but isn't the gatekeeper) ──
  r.post('/policies/:id/share-requests', async (req, res) => {
    if (!(await canManage(req, req.params.id))) return res.status(403).json({ error: 'forbidden' });
    const p = (await pool.query('select id, name, confidential, confidential_by from policies where id=$1', [req.params.id])).rows[0];
    if (!p) return res.status(404).json({ error: 'not_found' });
    if (!p.confidential) return res.status(409).json({ error: 'not_confidential', detail: 'This document is not confidential — assign groups directly.' });
    if (p.confidential_by === req.user.oid || isAdmin(req)) return res.status(409).json({ error: 'no_request_needed', detail: 'You can change who this is shared with directly.' });
    const groupIds = [...new Set((Array.isArray(req.body && req.body.groupIds) ? req.body.groupIds : []).filter(Boolean))];
    if (!groupIds.length) return res.status(400).json({ error: 'no_groups', detail: 'Choose at least one group to request sharing with.' });
    const comment = ((req.body && req.body.comment) || '').trim() || null;
    const reqRow = (await pool.query(
      'insert into share_requests (policy_id, requested_by, group_ids, comment) values ($1,$2,$3,$4) returning id, status, created_at',
      [p.id, req.user.oid, groupIds, comment])).rows[0];
    await audit(req, 'policy.share.request', p.name, { id: p.id, request: reqRow.id, groups: groupIds });
    notify(() => emailUser(p.confidential_by, 'Share request: ' + p.name,
      `A request to share the confidential document <strong>${escapeHtml(p.name)}</strong> with additional groups is awaiting your approval.`));
    res.status(201).json({ ok: true, id: reqRow.id, status: reqRow.status });
  });

  // ── requests awaiting MY decision (I'm the gatekeeper); admins see all pending ──
  r.get('/share-requests/pending', async (req, res) => {
    const rows = (await pool.query(
      `select sr.id, sr.policy_id, p.name as policy_name, sr.group_ids, sr.comment, sr.created_at,
              e.display_name as requested_by_name,
              coalesce(array_agg(g.name) filter (where g.id is not null), '{}') as group_names
         from share_requests sr
         join policies p on p.id = sr.policy_id
         left join employees e on e.oid = sr.requested_by
         left join groups g on g.id = any(sr.group_ids)
        where sr.status = 'pending' and (${isAdmin(req) ? 'true' : 'p.confidential_by = $1'})
        group by sr.id, p.name, e.display_name
        order by sr.created_at`, isAdmin(req) ? [] : [req.user.oid])).rows;
    res.json(rows);
  });

  // ── a policy's share requests (governor) ──
  r.get('/policies/:id/share-requests', async (req, res) => {
    if (!(await canManage(req, req.params.id))) return res.status(403).json({ error: 'forbidden' });
    const rows = (await pool.query(
      `select sr.id, sr.requested_by, e.display_name as requested_by_name, sr.group_ids, sr.comment,
              sr.status, sr.decided_by, sr.decided_at, sr.decision_note, sr.created_at
         from share_requests sr left join employees e on e.oid = sr.requested_by
        where sr.policy_id = $1 order by sr.created_at desc`, [req.params.id])).rows;
    res.json(rows);
  });

  // ── decide a share request (gatekeeper or admin) ──
  // Approve applies the assignment atomically; only the gatekeeper of THIS
  // policy (or an admin) may decide, and only while the request is pending.
  async function decide(req, res, approve) {
    const reqId = parseInt(req.params.reqId, 10);
    if (!Number.isInteger(reqId)) return res.status(400).json({ error: 'bad_id' });
    const client = await pool.connect();
    try {
      await client.query('begin');
      const sr = (await client.query('select * from share_requests where id=$1 for update', [reqId])).rows[0];
      if (!sr) { await client.query('rollback'); return res.status(404).json({ error: 'not_found' }); }
      const p = (await client.query('select id, name, confidential_by from policies where id=$1', [sr.policy_id])).rows[0];
      const isGatekeeper = p && p.confidential_by && p.confidential_by === req.user.oid;
      if (!isAdmin(req) && !isGatekeeper) { await client.query('rollback'); return res.status(403).json({ error: 'forbidden', detail: 'Only the document’s confidentiality owner can decide this.' }); }
      if (sr.status !== 'pending') { await client.query('rollback'); return res.status(409).json({ error: 'bad_state', detail: 'This request has already been decided.' }); }
      const note = ((req.body && req.body.note) || '').trim() || null;
      if (approve) {
        for (const gid of sr.group_ids) {
          await client.query('insert into policy_groups (policy_id, group_id) values ($1,$2) on conflict do nothing', [sr.policy_id, gid]);
        }
      }
      await client.query('update share_requests set status=$2, decided_by=$3, decided_at=now(), decision_note=$4 where id=$1',
        [reqId, approve ? 'approved' : 'denied', req.user.oid, note]);
      await audit(req, approve ? 'policy.share.approve' : 'policy.share.deny', p.name, { id: p.id, request: reqId, groups: sr.group_ids }, client);
      await client.query('commit');
      notify(() => emailUser(sr.requested_by, 'Share request ' + (approve ? 'approved' : 'declined') + ': ' + p.name,
        `Your request to share <strong>${escapeHtml(p.name)}</strong> was ${approve ? 'approved — the groups now have access' : 'declined'}.${note ? ' Note: “' + escapeHtml(note) + '”.' : ''}`));
      res.json({ ok: true, status: approve ? 'approved' : 'denied' });
    } catch (e) {
      try { await client.query('rollback'); } catch (_) { /* ignore */ }
      if (req.log) req.log.error({ err: e.message }, 'share decide failed');
      res.status(500).json({ error: 'server_error' });
    } finally { client.release(); }
  }
  r.post('/share-requests/:reqId/approve', (req, res) => decide(req, res, true));
  r.post('/share-requests/:reqId/deny', (req, res) => decide(req, res, false));

  // ── cancel my own pending request ──
  r.post('/share-requests/:reqId/cancel', async (req, res) => {
    const reqId = parseInt(req.params.reqId, 10);
    if (!Number.isInteger(reqId)) return res.status(400).json({ error: 'bad_id' });
    const upd = (await pool.query(
      "update share_requests set status='cancelled' where id=$1 and requested_by=$2 and status='pending' returning id",
      [reqId, req.user.oid])).rows[0];
    if (!upd) return res.status(409).json({ error: 'bad_state', detail: 'Nothing to cancel.' });
    res.json({ ok: true, status: 'cancelled' });
  });
};

module.exports.guardConfidentialShare = guardConfidentialShare;
