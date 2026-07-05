// Generated from the former monolithic routes.js — handler bodies are verbatim.
const { pool } = require('../db');
const cfg = require('../config');
const { forwardEvent } = require('../logger');
const { requireAdmin } = require('../auth');
const { runSync } = require('../services/sync');
const { runReminders } = require('../services/reminders');
const { listLibraries, listFolder } = require('../services/sharepoint');
const { isSafeHttpUrl, pgEnvFrom } = require('../util');
const { audit } = require('../authz');
const { collectSubject } = require('../gdpr');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const BACKUP_DIR = '/backups';

module.exports = (r) => {
// ── trigger directory sync (admin) ───────────────────────────
r.post('/sync', requireAdmin, async (req, res) => {
  try {
    const out = await runSync();
    await audit(req, 'directory.sync', 'Entra ID', out);
    res.json({ status: 'success', ...out });
  } catch (e) {
    res.status(502).json({ status: 'error', error: e.message });
  }
});

// ── last directory sync status (admin) ───────────────────────
r.get('/sync/status', requireAdmin, async (_req, res) => {
  const row = (await pool.query(
    `select source, started_at, finished_at, added, updated, status, error
       from sync_runs order by started_at desc limit 1`)).rows[0];
  res.json(row || null);
});

// ── manual database backup (admin) — streams a pg_dump download ──
r.get('/admin/backup', requireAdmin, async (req, res) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  res.setHeader('Content-Type', 'application/sql');
  res.setHeader('Content-Disposition', `attachment; filename="governance-backup-${stamp}.sql"`);
  const dump = spawn('pg_dump', ['--no-owner', '--clean', '--if-exists'], { env: pgEnvFrom(cfg.databaseUrl, process.env) });
  dump.stdout.pipe(res);
  let errOut = '';
  dump.stderr.on('data', (d) => { errOut += d.toString(); });
  dump.on('error', (e) => { console.error('[backup] spawn failed:', e.message); if (!res.headersSent) res.status(500).json({ error: 'backup_failed', detail: e.message }); });
  dump.on('close', (code) => {
    if (code !== 0) { console.error('[backup] pg_dump exit', code, errOut); if (!res.headersSent) res.status(500).json({ error: 'backup_failed', detail: errOut.slice(0, 300) }); }
    audit(req, 'admin.backup', null, { code });
  });
});

// ── list server-stored backups (admin) ──
r.get('/admin/backups', requireAdmin, async (_req, res) => {
  let files = [];
  try {
    files = fs.readdirSync(BACKUP_DIR)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => { const st = fs.statSync(path.join(BACKUP_DIR, f)); return { name: f, size: st.size, at: st.mtime }; })
      .sort((a, b) => b.at - a.at);
  } catch (e) { /* dir may not exist yet */ }
  res.json(files);
});

// ── create a backup on the server now (admin) ──
r.post('/admin/backups', requireAdmin, async (req, res) => {
  try { if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true }); }
  catch (e) { return res.status(500).json({ error: 'backup_failed', detail: 'no backups dir' }); }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = path.join(BACKUP_DIR, `governance-${stamp}.sql`);
  const out = fs.createWriteStream(file);
  const dump = spawn('pg_dump', ['--no-owner', '--clean', '--if-exists'], { env: pgEnvFrom(cfg.databaseUrl, process.env) });
  let errOut = '';
  dump.stdout.pipe(out);
  dump.stderr.on('data', (d) => { errOut += d.toString(); });
  dump.on('error', (e) => { console.error('[backup] spawn failed:', e.message); if (!res.headersSent) res.status(500).json({ error: 'backup_failed', detail: e.message }); });
  dump.on('close', (code) => {
    if (code !== 0) { try { fs.unlinkSync(file); } catch (_) {} console.error('[backup] exit', code, errOut); return res.status(500).json({ error: 'backup_failed', detail: errOut.slice(0, 300) }); }
    let size = 0; try { size = fs.statSync(file).size; } catch (_) {}
    audit(req, 'admin.backup.server', `governance-${stamp}.sql`, { size });
    res.status(201).json({ name: `governance-${stamp}.sql`, size });
  });
});

// ── download a specific stored backup (admin) ──
r.get('/admin/backups/:name', requireAdmin, async (req, res) => {
  const name = path.basename(req.params.name);   // prevent path traversal
  if (!/^[\w.-]+\.sql$/.test(name)) return res.status(400).json({ error: 'bad_name' });
  const file = path.join(BACKUP_DIR, name);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'not_found' });
  res.setHeader('Content-Type', 'application/sql');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  fs.createReadStream(file).pipe(res);
});

// ── send reminder emails now (admin) ─────────────────────────
r.post('/reminders/run', requireAdmin, async (req, res) => {
  try { const out = await runReminders(); await audit(req, 'reminders.run', null, out); res.json({ status: 'success', ...out }); }
  catch (e) { res.status(502).json({ status: 'error', error: e.message }); }
});

// ── integrations: log forwarding (push) + consumer feed (pull) ──
r.get('/integrations', requireAdmin, async (_req, res) => {
  const c = (await pool.query('select * from integration_config where id=1')).rows[0] || {};
  // Never return the stored secrets in full — only whether they're set.
  res.json({
    forwardEnabled: !!c.forward_enabled,
    forwardUrl: c.forward_url || '',
    forwardTokenSet: !!c.forward_token,
    feedEnabled: !!c.feed_enabled,
    feedKeySet: !!c.feed_api_key,
    lastForwardAt: c.last_forward_at,
    lastForwardStatus: c.last_forward_status,
  });
});

r.put('/integrations', requireAdmin, async (req, res) => {
  const { forwardEnabled, forwardUrl, forwardToken, feedEnabled } = req.body || {};
  // Reject loopback/link-local/non-http(s) forward targets up front (anti-SSRF).
  if (forwardUrl && !isSafeHttpUrl(forwardUrl)) {
    return res.status(400).json({ error: 'bad_url', detail: 'Forward URL must be http(s) and not a loopback/link-local address.' });
  }
  // forwardToken: undefined = leave as-is, '' = clear, string = set.
  await pool.query(
    `update integration_config set
       forward_enabled=$1, forward_url=$2,
       forward_token = case when $3::text is null then forward_token else nullif($3,'') end,
       feed_enabled=$4, updated_at=now() where id=1`,
    [!!forwardEnabled, forwardUrl || null, (forwardToken === undefined ? null : forwardToken), !!feedEnabled]);
  await audit(req, 'integration.update', null, { forwardEnabled: !!forwardEnabled, feedEnabled: !!feedEnabled });
  res.json({ ok: true });
});

// Generate (or rotate) the consumer feed API key — returned ONCE.
r.post('/integrations/feed-key', requireAdmin, async (req, res) => {
  const key = 'gov_' + crypto.randomBytes(24).toString('hex');
  await pool.query('update integration_config set feed_api_key=$1, feed_enabled=true where id=1', [key]);
  await audit(req, 'integration.feed_key.rotate', null, null);
  res.json({ apiKey: key });   // shown once; only a hash-of-presence is exposed afterwards
});

// Send a test event to the configured forward URL.
r.post('/integrations/test', requireAdmin, async (req, res) => {
  const c = (await pool.query('select forward_url, forward_token, forward_enabled from integration_config where id=1')).rows[0];
  if (!c || !c.forward_url) return res.status(400).json({ error: 'no_url', detail: 'Set a forward URL first.' });
  const out = await forwardEvent({ ...c, forward_enabled: true }, {
    type: 'test', at: new Date().toISOString(), action: 'integration.test',
    actorName: req.user.name, message: 'Birgma Governance test event',
  });
  await pool.query('update integration_config set last_forward_at=now(), last_forward_status=$1 where id=1',
    [out.ok ? 'ok' : (out.error || ('http ' + out.status))]);
  res.json(out);
});

// ── GDPR DSAR: export everything held about one data subject (admin) ──
// Art. 15/20 — a machine-readable package of the subject's own data. Read-only
// (safe under the app role); the actual export is itself audited. Erasure is
// intentionally NOT exposed here — it runs via the privileged CLI (db/gdpr.js)
// so the running app can never delete the append-only ledgers.
r.get('/admin/data-subject/:oid/export', requireAdmin, async (req, res) => {
  const pkg = await collectSubject(pool, req.params.oid);
  if (!pkg.found) return res.status(404).json({ error: 'not_found', detail: 'No data subject with that oid.' });
  await audit(req, 'gdpr.dsar.export', req.params.oid, { counts: pkg.counts });
  res.setHeader('Content-Disposition', `attachment; filename="dsar-${req.params.oid}.json"`);
  res.json(pkg);
});

// ── admin audit log (read) ───────────────────────────────────
r.get('/audit', requireAdmin, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);
  res.json((await pool.query('select * from audit_log order by at desc limit $1', [limit])).rows);
});

// ── browse the SharePoint policy library (admin) — powers the file picker ──
// No ?drive → returns the list of document libraries. ?drive=<id>&path=<rel> → folder contents.
r.get('/sharepoint/browse', requireAdmin, async (req, res) => {
  try {
    const { drive, path } = req.query;
    if (!drive) {
      const items = await listLibraries();
      return res.json({ level: 'libraries', path: '', items });
    }
    const out = await listFolder(drive, path || '');
    res.json({ level: 'folder', ...out });
  } catch (e) {
    console.error('[sharepoint/browse] failed:', e.statusCode || '', e.code || '', e.message);
    res.status(502).json({ error: 'sharepoint_browse_failed', detail: e.message });
  }
});
};
