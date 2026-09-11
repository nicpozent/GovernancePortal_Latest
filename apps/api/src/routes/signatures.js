// Generated from the former monolithic routes.js — handler bodies are verbatim.
const { pool } = require('../db');
const cfg = require('../config');
const { sendMail } = require('../services/reminders');
const { escapeHtml } = require('../util');
const { isAdmin, canAcknowledge } = require('../authz');
const { ensureRevision } = require('../services/revisions');

module.exports = (r) => {
// ── SIGN (the read-and-acknowledge flow) ─────────────────────
// Identity (oid, name) is taken from the verified token — not trusted from the client.
r.post('/signatures', async (req, res) => {
  const { policyId, fullName, acknowledged } = req.body || {};
  if (acknowledged !== true) return res.status(400).json({ error: 'must_acknowledge' });
  if (!fullName || !fullName.trim()) return res.status(400).json({ error: 'name_required' });

  // Eligibility: only an active employee may sign a published, non-archived policy
  // that is actually assigned to them — not any authenticated user with a policy id.
  const elig = await canAcknowledge(req, policyId);
  if (!elig.ok) return res.status(elig.status).json({ error: elig.error, ...(elig.detail ? { detail: elig.detail } : {}) });

  const p = (await pool.query('select version from policies where id = $1', [policyId])).rows[0];
  if (!p) return res.status(404).json({ error: 'policy_not_found' });

  // If the policy has a quiz, the user must have passed it before signing.
  const quiz = (await pool.query('select id from quizzes where policy_id = $1 and archived_at is null', [policyId])).rows[0];
  if (quiz) {
    const passed = (await pool.query(
      'select 1 from quiz_attempts where policy_id = $1 and user_oid = $2 and passed limit 1', [policyId, req.user.oid])).rows[0];
    if (!passed) return res.status(403).json({ error: 'quiz_required', detail: 'You must pass the knowledge check before signing.' });
  }

  // Freeze (or reuse) the immutable content revision the user is acknowledging,
  // and bind the signature to it (ADR-121 / #4). For a real document we REFUSE to
  // record an acknowledgement we can't tie to reproducible content — a transient
  // SharePoint outage returns 503 so the user retries rather than signing
  // something unverifiable. A link-only policy (no fetchable bytes) yields null,
  // and the signature is recorded unbound, exactly as before.
  let revisionId = null;
  try {
    const rev = await ensureRevision(policyId, { actorOid: req.user.oid });
    revisionId = rev ? rev.id : null;
  } catch (e) {
    console.error('[sign] could not freeze content revision:', e.message);
    return res.status(503).json({ error: 'content_unavailable', detail: 'Could not capture the document for your records. Please try again in a moment.' });
  }

  const ins = await pool.query(
    `insert into signatures (policy_id, policy_version, user_oid, full_name, acknowledged, ip_address, user_agent, revision_id)
     values ($1, $2, $3, $4, true, $5, $6, $7) returning *`,
    [policyId, p.version, req.user.oid, fullName.trim(), req.ip, req.headers['user-agent'] || null, revisionId]
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
};
