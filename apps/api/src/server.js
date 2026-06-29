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

// ── Scheduled daily backup → /backups (mounted volume), keep last 14 ──
// Gated by SCHEDULERS_ENABLED so only one instance runs it when scaled out.
(function scheduleBackups() {
  if (!cfg.schedulersEnabled) { logger.info('schedulers disabled; skipping auto-backup'); return; }
  const { spawn } = require('child_process');
  const fs = require('fs');
  const dir = '/backups';
  const run = () => {
    try {
      if (!fs.existsSync(dir)) return;
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const file = `${dir}/governance-${stamp}.sql`;
      const out = fs.createWriteStream(file);
      // Pass DB credentials via env (PG* vars), never as argv — argv is visible
      // in the host process list.
      const dump = spawn('pg_dump', ['--no-owner', '--clean', '--if-exists'], { env: pgEnvFrom(cfg.databaseUrl, process.env) });
      dump.stdout.pipe(out);
      dump.stderr.on('data', (d) => console.error('[auto-backup]', d.toString()));
      dump.on('close', (code) => {
        if (code !== 0) { console.error('[auto-backup] failed, exit', code); return; }
        console.log('[auto-backup] wrote', file);
        // retention: keep the most recent N
        try {
          const files = fs.readdirSync(dir).filter((f) => f.startsWith('governance-') && f.endsWith('.sql')).sort();
          while (files.length > cfg.backupRetention) { fs.unlinkSync(`${dir}/${files.shift()}`); }
        } catch (e) { console.error('[auto-backup] retention', e.message); }
      });
    } catch (e) { console.error('[auto-backup] error', e.message); }
  };
  setInterval(run, 24 * 60 * 60 * 1000);   // every 24h
  setTimeout(run, 60 * 1000);              // once, a minute after startup
})();

// ── Scheduled daily directory sync + reminder emails ────────
(function scheduleDaily() {
  if (!cfg.schedulersEnabled) { logger.info('schedulers disabled; skipping auto-sync/reminders'); return; }
  const { runSync } = require('./services/sync');
  const { runReminders } = require('./services/reminders');
  const tick = async () => {
    try { await runSync(); } catch (e) { console.error('[auto-sync]', e.message); }
    if (cfg.remindersEnabled) { try { await runReminders(); } catch (e) { console.error('[auto-reminders]', e.message); } }
  };
  setInterval(tick, 24 * 60 * 60 * 1000);  // daily
  setTimeout(tick, 3 * 60 * 1000);         // once, 3 min after startup
})();
