// ============================================================
//  Leader election for singleton scheduled jobs (HA step 2).
//
//  The in-process daily jobs (pg_dump backup, directory sync, reminder emails)
//  must run on EXACTLY ONE instance. Previously that meant manually setting
//  SCHEDULERS_ENABLED=false on every replica but one — fragile. Instead each
//  replica now tries to grab a Postgres SESSION-level advisory lock before
//  running a tick; only the holder proceeds, the rest skip. No extra
//  infrastructure — it uses the database the app already has.
//
//  Why advisory locks:
//    - Automatic: whichever replica wins the lock runs the job; leave
//      SCHEDULERS_ENABLED=true everywhere.
//    - Self-healing: the lock is tied to the DB SESSION, so if the leader
//      crashes mid-job its connection drops and the lock is released — the
//      next tick on any replica can take over.
//    - Single-instance safe: one instance always wins → behaviour identical
//      to today.
//
//  The lock is held for the WHOLE duration of the job (the dedicated client is
//  checked out until fn resolves), so a slow backup can't be double-started by
//  a second replica halfway through.
// ============================================================
const { pool } = require('./db');
const { logger } = require('./logger');

// Distinct, stable advisory-lock keys per job. Arbitrary 32-bit ints; they only
// need to be unique across the jobs that share this database.
const LOCK_KEYS = {
  backup: 720240001,
  daily: 720240002,
};

// Run `fn` only if this instance can acquire the named advisory lock. Returns
// true if we became leader and ran it, false if another instance holds it.
// The lock is always released (finally), even if `fn` throws.
async function withLeaderLock(name, fn) {
  const key = LOCK_KEYS[name];
  if (key === undefined) throw new Error(`unknown leader lock: ${name}`);
  const client = await pool.connect();
  let locked = false;
  try {
    locked = (await client.query('select pg_try_advisory_lock($1) as ok', [key])).rows[0].ok;
    if (!locked) {
      logger.info({ job: name }, 'leader lock held by another instance; skipping tick');
      return false;
    }
    await fn();
    return true;
  } finally {
    if (locked) {
      try { await client.query('select pg_advisory_unlock($1)', [key]); }
      catch (e) { logger.warn({ job: name, err: e.message }, 'advisory unlock failed'); }
    }
    client.release();
  }
}

module.exports = { withLeaderLock, LOCK_KEYS };
