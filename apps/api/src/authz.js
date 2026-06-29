// ============================================================
//  Authorization helpers shared by the route modules.
//  - role checks (isAdmin / isManager)
//  - audit() — append-only admin audit + fire-and-forget forwarding
//  - teamOids() — a manager's team scope
//  - canManage() / canRead() — ownership + effective-membership gates
// ============================================================
const { pool } = require('./db');
const cfg = require('./config');
const { logger, forwardEvent } = require('./logger');

const isAdmin = (req) => req.user.roles.includes(cfg.adminAppRole);
const isManager = (req) => req.user.roles.includes(cfg.managerAppRole);

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
              select group_id, employee_oid from effective_group_membership
            ) em on em.group_id = x.group_id
           where x.policy_id = $1 and em.employee_oid = $2
        )
    limit 1`, [policyId, req.user.oid]);
  return r.rowCount > 0;
}

module.exports = { isAdmin, isManager, audit, teamOids, canManage, canRead };
