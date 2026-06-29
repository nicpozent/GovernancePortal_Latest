const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const pinoHttp = require('pino-http');
const { logger } = require('./logger');
const cfg = require('./config');
const { pgEnvFrom } = require('./util');
const routes = require('./routes');

const app = express();

// Log unhandled rejections. After a truly-uncaught exception the process may be
// in an undefined state — log it, then exit so the container restart policy
// (restart: unless-stopped) recycles us into a clean process.
process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandledRejection'));
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'uncaughtException');
  setTimeout(() => process.exit(1), 100).unref();   // brief delay to flush the log
});

// Behind Azure Front Door / App Gateway: trust the proxy so req.ip is the real client.
app.set('trust proxy', 1);

// Structured request logging with a correlation id (echoed to the client on errors).
app.use(pinoHttp({
  logger,
  genReqId: (req, res) => {
    const id = req.headers['x-request-id'] || crypto.randomUUID();
    res.setHeader('x-request-id', id);
    return id;
  },
  customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
  // Identify the caller without logging the token itself.
  customProps: (req) => ({ user: req.user && req.user.oid }),
  autoLogging: { ignore: (req) => req.url === '/healthz' },
}));

// Security headers (HSTS, no-sniff, frame-deny, etc.)
app.use(helmet());

// CORS locked to the single SPA origin — no wildcards.
app.use(cors({ origin: cfg.frontendOrigin, methods: ['GET', 'POST', 'PUT', 'DELETE'], maxAge: 600 }));

app.use(express.json({ limit: '256kb' }));

// Basic abuse protection (all API traffic).
app.use('/api', rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false }));
// Directory sync is expensive — cap it hard.
app.use('/api/sync', rateLimit({ windowMs: 5 * 60_000, max: 5, standardHeaders: true, legacyHeaders: false }));
// The consumer feed lives outside /api and authenticates with an API key —
// give it its own limiter so it can't be hammered / brute-forced.
app.use('/feed', rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false }));

// Liveness probe for the platform.
app.get('/healthz', (_req, res) => res.json({ ok: true }));

// ── Consumer feed (PULL) — external systems read the audit log with an API key.
// Separate from Entra auth: a bearer API key the admin generates in Integrations.
app.get('/feed/audit', async (req, res) => {
  try {
    const { pool } = require('./db');
    const c = (await pool.query('select feed_enabled, feed_api_key from integration_config where id=1')).rows[0];
    const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!c || !c.feed_enabled || !c.feed_api_key) return res.status(404).json({ error: 'feed_disabled' });
    // constant-time compare
    const a = Buffer.from(auth), b = Buffer.from(c.feed_api_key);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      logger.warn({ ip: req.ip }, 'feed/audit unauthorized');
      return res.status(401).json({ error: 'unauthorized' });
    }
    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 1000);
    const since = req.query.since ? new Date(req.query.since) : null;
    const rows = (await pool.query(
      `select id, at, actor_name, action, target, detail, ip from audit_log
        where ($1::timestamptz is null or at > $1) order by at asc limit $2`,
      [since && !isNaN(since) ? since.toISOString() : null, limit])).rows;
    res.json({ count: rows.length, events: rows });
  } catch (e) { logger.error({ err: e.message }, 'feed/audit failed'); res.status(500).json({ error: 'server_error' }); }
});

// All business endpoints (each requires a valid Entra token).
app.use('/api', routes);

// Optional: Entra SCIM provisioning endpoint (zero Graph permissions).
// Uncomment after wiring scim/scim.routes.js + its bearer secret.
// app.use('/scim/v2', require('../scim/scim.routes'));

// JSON error handler — never leak stack traces to clients; include the request id
// so a user-reported error can be traced to its exact log line.
app.use((err, req, res, _next) => {
  if (req.log) req.log.error({ err }, 'request failed'); else logger.error({ err }, 'request failed');
  res.status(err.status || 500).json({ error: 'server_error', requestId: req.id });
});

app.listen(cfg.port, () => logger.info({ port: cfg.port }, 'Governance API listening'));

// ── Scheduled daily backup → /backups (mounted volume), keep last 14 ──
(function scheduleBackups() {
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
  const cfg = require('./config');
  const { runSync } = require('./services/sync');
  const { runReminders } = require('./services/reminders');
  const tick = async () => {
    try { await runSync(); } catch (e) { console.error('[auto-sync]', e.message); }
    if (cfg.remindersEnabled) { try { await runReminders(); } catch (e) { console.error('[auto-reminders]', e.message); } }
  };
  setInterval(tick, 24 * 60 * 60 * 1000);  // daily
  setTimeout(tick, 3 * 60 * 1000);         // once, 3 min after startup
})();
