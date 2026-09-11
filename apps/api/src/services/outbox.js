// ============================================================
//  Audit forwarding OUTBOX (#13).
//  audit() enqueues an event row here (in the same executor — and therefore the
//  same transaction — as the audit_log insert). A leader-locked worker
//  (drainOutbox, scheduled in server.js) delivers pending rows to the configured
//  external SIEM with retry + exponential backoff, so forwarding survives a
//  process crash instead of being fire-and-forget.
// ============================================================
const { pool } = require('../db');
const { forwardEvent } = require('../logger');

const MAX_ATTEMPTS = 5;   // after this many failures a row is marked 'failed' (alertable)
const BATCH = 50;         // rows processed per drain tick

// Enqueue an event for durable forwarding. `db` is the caller's executor (a
// transaction client when the audit is written inside one, else the pool).
async function enqueue(db, event) {
  await db.query('insert into audit_outbox (event) values ($1)', [JSON.stringify(event)]);
}

// Deliver due pending events. Safe to run on exactly one instance at a time
// (server.js wraps it in a leader lock). Returns the number of rows processed.
async function drainOutbox() {
  const cfg = (await pool.query(
    'select forward_enabled, forward_url, forward_token from integration_config where id=1')).rows[0] || {};
  const rows = (await pool.query(
    "select id, event from audit_outbox where status='pending' and next_attempt_at <= now() order by id limit $1",
    [BATCH])).rows;

  if (rows.length && !cfg.forward_enabled) {
    // Forwarding is off — don't accumulate a backlog; mark them skipped.
    await pool.query("update audit_outbox set status='skipped', updated_at=now() where id = any($1)", [rows.map((r) => r.id)]);
  } else if (rows.length) {
    let last = null;
    for (const row of rows) {
      const out = await forwardEvent({ ...cfg, forward_enabled: true }, row.event);
      if (out.ok) {
        await pool.query("update audit_outbox set status='sent', last_error=null, updated_at=now() where id=$1", [row.id]);
        last = 'ok';
      } else {
        const err = out.error || ('http ' + out.status);
        // attempts (pre-increment) drives the backoff: 1,2,4,… minutes, capped at 60.
        await pool.query(
          `update audit_outbox set attempts = attempts + 1,
             status = case when attempts + 1 >= $2 then 'failed' else 'pending' end,
             next_attempt_at = now() + (interval '1 minute' * least(power(2, attempts)::int, 60)),
             last_error = $3, updated_at = now()
           where id = $1`, [row.id, MAX_ATTEMPTS, err]);
        last = err;
      }
    }
    if (last !== null) {
      await pool.query('update integration_config set last_forward_at=now(), last_forward_status=$1 where id=1',
        [last === 'ok' ? 'ok' : last]);
    }
  }

  // Keep the table bounded: drop terminal rows older than 7 days.
  await pool.query("delete from audit_outbox where status in ('sent','skipped') and updated_at < now() - interval '7 days'");
  return rows.length;
}

module.exports = { enqueue, drainOutbox, MAX_ATTEMPTS };
