// ============================================================
//  Process entry point: owns the lifecycle (listen, schedulers,
//  process-level error handlers). The Express app itself lives in
//  app.js so it can be imported by tests without side effects.
// ============================================================
const { logger } = require('./logger');
const cfg = require('./config');
const { pgEnvFrom } = require('./util');
const app = require('./app');

// Log unhandled rejections. After a truly-uncaught exception the process may be
// in an undefined state — log it, then exit so the container restart policy
// (restart: unless-stopped) recycles us into a clean process.
process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandledRejection'));
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'uncaughtException');
  setTimeout(() => process.exit(1), 100).unref();   // brief delay to flush the log
});

app.listen(cfg.port, () => logger.info({ port: cfg.port }, 'Governance API listening'));

const { withLeaderLock } = require('./leader');

// ── Scheduled daily backup → /backups (mounted volume), keep last 14 ──
// Gated by SCHEDULERS_ENABLED (kill-switch) AND a Postgres advisory lock so
// exactly one instance runs it when the API is scaled out — leave
// SCHEDULERS_ENABLED=true on every replica; the lock arbitrates.
(function scheduleBackups() {
  if (!cfg.schedulersEnabled) { logger.info('schedulers disabled; skipping auto-backup'); return; }
  const { spawn } = require('child_process');
  const fs = require('fs');
  const dir = '/backups';
  // The actual dump, as a promise that resolves only when pg_dump finishes —
  // so the leader lock is held for the whole backup, never released mid-dump.
  const doBackup = () => new Promise((resolve) => {
    if (!fs.existsSync(dir)) return resolve();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const file = `${dir}/governance-${stamp}.sql`;
    const out = fs.createWriteStream(file);
    // Pass DB credentials via env (PG* vars), never as argv — argv is visible
    // in the host process list.
    const dump = spawn('pg_dump', ['--no-owner', '--clean', '--if-exists'], { env: pgEnvFrom(cfg.databaseUrl, process.env) });
    dump.stdout.pipe(out);
    dump.stderr.on('data', (d) => console.error('[auto-backup]', d.toString()));
    dump.on('error', (e) => { console.error('[auto-backup] spawn error', e.message); resolve(); });
    dump.on('close', (code) => {
      if (code !== 0) { console.error('[auto-backup] failed, exit', code); return resolve(); }
      console.log('[auto-backup] wrote', file);
      // retention: keep the most recent N
      try {
        const files = fs.readdirSync(dir).filter((f) => f.startsWith('governance-') && f.endsWith('.sql')).sort();
        while (files.length > cfg.backupRetention) { fs.unlinkSync(`${dir}/${files.shift()}`); }
      } catch (e) { console.error('[auto-backup] retention', e.message); }
      resolve();
    });
  });
  const run = () => withLeaderLock('backup', doBackup)
    .catch((e) => logger.error({ err: e.message }, 'auto-backup leader lock'));
  setInterval(run, 24 * 60 * 60 * 1000);   // every 24h
  setTimeout(run, 60 * 1000);              // once, a minute after startup
})();

// ── Scheduled daily directory sync + reminder emails ────────
(function scheduleDaily() {
  if (!cfg.schedulersEnabled) { logger.info('schedulers disabled; skipping auto-sync/reminders'); return; }
  const { runSync } = require('./services/sync');
  const { runReminders } = require('./services/reminders');
  const tick = () => withLeaderLock('daily', async () => {
    try { await runSync(); } catch (e) { console.error('[auto-sync]', e.message); }
    if (cfg.remindersEnabled) { try { await runReminders(); } catch (e) { console.error('[auto-reminders]', e.message); } }
  }).catch((e) => logger.error({ err: e.message }, 'auto-sync/reminders leader lock'));
  setInterval(tick, 24 * 60 * 60 * 1000);  // daily
  setTimeout(tick, 3 * 60 * 1000);         // once, 3 min after startup
})();

// ── Audit outbox drain: forward audit/business events with retry ────────────
// Runs frequently (not daily) so external forwarding is near-real-time; a
// Postgres advisory lock keeps exactly one instance draining when scaled out.
(function scheduleOutbox() {
  if (!cfg.schedulersEnabled) { logger.info('schedulers disabled; skipping audit-outbox drain'); return; }
  const { drainOutbox } = require('./services/outbox');
  const run = () => withLeaderLock('outbox', drainOutbox)
    .catch((e) => logger.error({ err: e.message }, 'audit-outbox drain leader lock'));
  setInterval(run, 60 * 1000);   // every minute
  setTimeout(run, 15 * 1000);    // shortly after startup
})();
