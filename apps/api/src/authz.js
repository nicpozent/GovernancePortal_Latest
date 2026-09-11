// ============================================================
//  Authorization helpers shared by the route modules.
//  - role checks (isAdmin / isManager)
//  - audit() — append-only admin audit + fire-and-forget forwarding
//  - teamOids() — a manager's team scope
//  - canManage() / canRead() — ownership + effective-membership gates
// ============================================================
const { pool } = require('./db');
const cfg = require('./config');
const { logger } = require('./logger');
const { enqueue } = require('./services/outbox');

const isAdmin = (req) => req.user.roles.includes(cfg.adminAppRole);
const isManager = (req) => req.user.roles.includes(cfg.managerAppRole);

// Append an admin audit entry and enqueue it for durable external forwarding.
// `db` is the executor: pass a transaction client to write the audit row (and its
// outbox row) ATOMICALLY with the mutation being audited — then an audit-write
// failure rolls the mutation back (in a transaction) instead of leaving a
// governed change with no audit record. Called on the shared pool it stays
// best-effort (a post-commit audit can't roll anything back, so it is logged).
async function audit(req, action, target, detail, db = pool) {
  const event = {
    type: 'audit',
    at: new Date().toISOString(),
    actorOid: req.user && req.user.oid,
    actorName: req.user && req.user.name,
    action, target: target || null, detail: detail || null,
    ip: req.ip, requestId: req.id,
  };
  const inTx = db !== pool;
  try {
    await db.query(
      `insert into audit_log (actor_oid, actor_name, action, target, detail, ip)
       values ($1,$2,$3,$4,$5,$6)`,
      [event.actorOid, event.actorName, action, target || null, detail ? JSON.stringify(detail) : null, req.ip]
    );
    // Durable forwarding: enqueue for the retrying outbox worker (replaces the
    // old fire-and-forget forward that was lost on a crash).
    await enqueue(db, event);
  } catch (e) {
    if (inTx) throw e;   // fail the mutation together with its audit
    (req.log || logger).error({ err: e.message }, 'audit write failed');
  }
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
  const p = (await pool.query('select owner_oid, approval_state, approved_externally from policies where id=$1', [policyId])).rows[0];
  if (!p) return false;
  if (p.owner_oid && p.owner_oid === req.user.oid) return true;
  // Approvers may read a policy while it is under review (before it's published).
  const appr = await pool.query('select 1 from policy_approvers where policy_id=$1 and approver_oid=$2 limit 1', [policyId, req.user.oid]);
  if (appr.rowCount > 0) return true;
  // Everyone else sees a policy only once it is PUBLISHED (or approved externally).
  if (!(p.approved_externally || p.approval_state === 'published')) return false;
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

// Can the caller ACKNOWLEDGE (sign) this policy? This is STRICTER than canRead
// on purpose: a signature is a personal compliance record, so the signer must be
// an obligation-holder — an ACTIVE employee, for a PUBLISHED, non-archived policy
// that is actually ASSIGNED to them via an effective group membership. It does not
// grant the owner/admin/approver shortcuts canRead has (they only apply if they
// are also an assigned, active member). Returns { ok:true } or
// { ok:false, status, error, detail? }.
async function canAcknowledge(req, policyId) {
  const p = (await pool.query(
    'select approval_state, approved_externally, archived_at from policies where id=$1', [policyId])).rows[0];
  if (!p) return { ok: false, status: 404, error: 'policy_not_found' };
  if (p.archived_at) return { ok: false, status: 409, error: 'policy_unavailable', detail: 'This policy is archived.' };
  if (!(p.approved_externally || p.approval_state === 'published')) {
    return { ok: false, status: 409, error: 'policy_not_published', detail: 'This policy is not published for acknowledgement.' };
  }
  const active = await pool.query(
    "select 1 from employees where oid=$1 and coalesce(status,'Active') <> 'Inactive' limit 1", [req.user.oid]);
  if (active.rowCount === 0) return { ok: false, status: 403, error: 'not_eligible', detail: 'Only an active employee can acknowledge.' };
  const assigned = await pool.query(`
    select 1 where exists (
        select 1 from policy_groups x
          join effective_group_membership em on em.group_id = x.group_id
         where x.policy_id = $1 and em.employee_oid = $2
      ) limit 1`, [policyId, req.user.oid]);
  if (assigned.rowCount === 0) return { ok: false, status: 403, error: 'not_assigned', detail: 'This policy is not assigned to you.' };
  return { ok: true };
}

module.exports = { isAdmin, isManager, audit, teamOids, canManage, canRead, canAcknowledge };
