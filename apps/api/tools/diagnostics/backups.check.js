// Subsystem: backup readiness (run where /backups is mounted — the api container).
// Run: node tools/diagnostics/backups.check.js
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { pass, warn, fail, skip, runStandalone } = require('./lib');

const DIR = process.env.DIAG_BACKUP_DIR || '/backups';

const group = {
  id: 'backups',
  title: `Backups (${DIR})`,
  checks: [
    { title: 'Backup directory exists and is writable', run: async () => {
      if (!fs.existsSync(DIR)) return warn('Backup directory exists', `${DIR} not found`, 'Mount the backups volume (deploy/docker-compose.yml) or set DIAG_BACKUP_DIR. Scheduled backups are skipped without it.');
      try { const t = path.join(DIR, `.diag-${process.pid}`); fs.writeFileSync(t, 'x'); fs.unlinkSync(t); return pass('Backup directory writable', DIR); }
      catch (e) { return fail('Backup directory writable', e.message, 'The api process cannot write to the backups volume — fix ownership/permissions.'); }
    } },
    { title: 'pg_dump is available on PATH', run: async () => {
      const r = spawnSync('pg_dump', ['--version'], { encoding: 'utf8' });
      if (r.error) return fail('pg_dump available', r.error.message, 'pg_dump is missing from the image — backups (manual and scheduled) cannot run. Install the matching postgresql-client.');
      return pass('pg_dump available', (r.stdout || '').trim());
    } },
    { title: 'A recent backup exists', run: async () => {
      if (!fs.existsSync(DIR)) return skip('Recent backup exists', 'no backup dir');
      const files = fs.readdirSync(DIR).filter((f) => f.startsWith('governance-') && f.endsWith('.sql'))
        .map((f) => ({ f, t: fs.statSync(path.join(DIR, f)).mtimeMs })).sort((a, b) => b.t - a.t);
      if (!files.length) return warn('Recent backup exists', 'none found', 'No backups yet — trigger one (POST /api/admin/backups) or wait for the daily job.');
      const ageH = (Date.now() - files[0].t) / 3.6e6;
      if (ageH > 48) return warn('Recent backup exists', `newest is ${ageH.toFixed(0)}h old (${files[0].f})`, 'Newest backup is stale (>48h) — is the scheduler running (SCHEDULERS_ENABLED)?');
      return pass('Recent backup exists', `${files.length} file(s), newest ${ageH.toFixed(1)}h old`);
    } },
  ],
};

module.exports = group;
if (require.main === module) runStandalone(group);
