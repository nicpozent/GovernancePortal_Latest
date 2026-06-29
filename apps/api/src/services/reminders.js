// ============================================================
//  Email reminders — sends acknowledgement reminders via Microsoft
//  Graph (Mail.Send application permission), idempotently.
//
//  Milestones per (policy, user, version):
//    'assigned'  — first time a requirement is seen (not yet signed)
//    'due-20' / 'due-15' / 'due-7' / 'due-1' — N days before the
//                  personal due date
//    'overdue'   — once, after the due date passes
//
//  Requires GRAPH_MAIL_SENDER (a mailbox UPN) + Mail.Send app permission.
//  No-op (logs a warning) if the sender is not configured.
// ============================================================
const graph = require('../graph');
const { pool } = require('../db');
const cfg = require('../config');
const { escapeHtml, milestoneFor } = require('../util');

async function sendMail(to, subject, html) {
  if (!cfg.graph.mailSender) throw new Error('GRAPH_MAIL_SENDER not configured');
  await graph.api(`/users/${cfg.graph.mailSender}/sendMail`).post({
    message: {
      subject,
      body: { contentType: 'HTML', content: html },
      toRecipients: [{ emailAddress: { address: to } }],
    },
    saveToSentItems: false,
  });
}

function emailHtml({ name, policy, version, due, milestone }) {
  const link = cfg.frontendUrl || '';
  const when = milestone === 'overdue'
    ? `was due on <strong>${due}</strong> and is now overdue`
    : milestone === 'assigned'
      ? `has been assigned to you${due ? ` and is due by <strong>${due}</strong>` : ''}`
      : `is due by <strong>${due}</strong>`;
  return `<div style="font-family:Segoe UI,Arial,sans-serif;color:#23283a;line-height:1.6">
    <p>Hello ${escapeHtml(name || 'there')},</p>
    <p>The policy <strong>${escapeHtml(policy)}</strong> (${escapeHtml(version)}) ${when}. Please read and acknowledge it in the Governance Portal.</p>
    ${link ? `<p><a href="${link}" style="background:#213a9e;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block">Open the Governance Portal</a></p>` : ''}
    <p style="color:#8a92a6;font-size:12px">This is an automated reminder from the Birgma Governance Portal.</p>
  </div>`;
}

// Core run: returns { sent, skipped, errors }. opts.onlyOids restricts to a team.
async function runReminders(opts) {
  const onlyOids = opts && Array.isArray(opts.onlyOids) ? opts.onlyOids : null;
  if (!cfg.graph.mailSender) { console.warn('[reminders] GRAPH_MAIL_SENDER not set — skipping'); return { sent: 0, skipped: 0, errors: 0, disabled: true }; }
  // Every required (employee, policy) at the current version that is NOT yet signed,
  // with the employee's personal due date and which milestones were already sent.
  const rows = (await pool.query(`
    with eff as (
      select group_id, employee_oid as oid from effective_group_membership
    ),
    -- A policy is "required" only for effective members of a group it's assigned
    -- to. Unassigned policies are private (admin/owner only, see canRead) and must
    -- NOT generate reminders to the whole workforce — keep this consistent with
    -- the employee policy list and the compliance dashboard.
    req as (
      select distinct pg.policy_id, em.oid
        from policy_groups pg
        join policies p on p.id=pg.policy_id and p.archived_at is null
        join eff em on em.group_id=pg.group_id
        join employees e on e.oid=em.oid and e.status='Active'
    )
    select r.policy_id, r.oid, p.name as policy, p.version,
           e.display_name, coalesce(e.email, e.upn) as email,
           (case when p.due_date is not null then p.due_date
                 when p.due_days is not null then (greatest(p.created_at::date, e.created_at::date) + (p.due_days||' days')::interval)::date
                 else null end) as due
      from req r
      join policies p on p.id=r.policy_id
      join employees e on e.oid=r.oid
     where not exists (select 1 from signatures s where s.policy_id=r.policy_id and s.user_oid=r.oid and s.policy_version=p.version)
  `)).rows.filter((r) => !onlyOids || onlyOids.includes(r.oid));

  let sent = 0, skipped = 0, errors = 0;
  for (const r of rows) {
    if (!r.email) { skipped++; continue; }
    const doneRows = (await pool.query(
      'select milestone from notifications_sent where policy_id=$1 and user_oid=$2 and policy_version=$3',
      [r.policy_id, r.oid, r.version])).rows.map((x) => x.milestone);
    const assignedSent = doneRows.includes('assigned');
    const days = r.due ? Math.ceil((new Date(r.due) - new Date(new Date().toDateString())) / 86400000) : null;
    const m = milestoneFor(days, assignedSent);
    if (!m || doneRows.includes(m)) { skipped++; continue; }
    try {
      await sendMail(r.email, `Action required: ${r.policy}`, emailHtml({ name: r.display_name, policy: r.policy, version: r.version, due: r.due ? new Date(r.due).toDateString() : null, milestone: m }));
      await pool.query('insert into notifications_sent (policy_id, user_oid, milestone, policy_version) values ($1,$2,$3,$4) on conflict do nothing', [r.policy_id, r.oid, m, r.version]);
      sent++;
    } catch (e) { console.error('[reminders] send failed for', r.email, e.message); errors++; }
  }
  // Policy review reminders: email the owner when a policy's review date is
  // within 14 days or overdue. Once per (policy, review_date).
  // Skipped for team-scoped (manager) runs — those send acknowledgement reminders only.
  let reviewSent = 0;
  const reviews = onlyOids ? [] : (await pool.query(`
    select p.id, p.name, p.version, p.review_date, p.owner_oid,
           coalesce(e.email, e.upn) as owner_email, e.display_name as owner_name
      from policies p
      join employees e on e.oid = p.owner_oid
     where p.archived_at is null and p.review_date is not null
       and p.review_date <= (current_date + interval '14 days')
  `)).rows;
  for (const rv of reviews) {
    if (!rv.owner_email) { skipped++; continue; }
    const mkey = 'review:' + new Date(rv.review_date).toISOString().slice(0, 10);
    const already = (await pool.query(
      'select 1 from notifications_sent where policy_id=$1 and user_oid=$2 and milestone=$3 and policy_version=$4',
      [rv.id, rv.owner_oid, mkey, rv.version])).rows[0];
    if (already) { skipped++; continue; }
    const days = Math.ceil((new Date(rv.review_date) - new Date(new Date().toDateString())) / 86400000);
    const when = days < 0 ? `was due for review on ${new Date(rv.review_date).toDateString()}` : `is due for review by ${new Date(rv.review_date).toDateString()}`;
    const html = `<div style="font-family:Segoe UI,Arial,sans-serif;color:#23283a;line-height:1.6">
      <p>Hello ${escapeHtml(rv.owner_name || 'there')},</p>
      <p>As the owner of <strong>${escapeHtml(rv.name)}</strong> (${escapeHtml(rv.version)}), please note it ${when}. Review the document and publish a new version if needed.</p>
      ${cfg.frontendUrl ? `<p><a href="${cfg.frontendUrl}" style="background:#213a9e;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block">Open the Governance Portal</a></p>` : ''}
      <p style="color:#8a92a6;font-size:12px">Automated review reminder from the Birgma Governance Portal.</p></div>`;
    try {
      await sendMail(rv.owner_email, `Policy review due: ${rv.name}`, html);
      await pool.query('insert into notifications_sent (policy_id, user_oid, milestone, policy_version) values ($1,$2,$3,$4) on conflict do nothing', [rv.id, rv.owner_oid, mkey, rv.version]);
      reviewSent++;
    } catch (e) { console.error('[reminders] review send failed for', rv.owner_email, e.message); errors++; }
  }

  console.log(`[reminders] sent=${sent} review=${reviewSent} skipped=${skipped} errors=${errors}`);
  return { sent: sent + reviewSent, skipped, errors };
}

module.exports = { runReminders, sendMail };
