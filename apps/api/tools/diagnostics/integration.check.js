// Subsystem: outbound integrations (audit forward webhook + consumer feed).
// DB-backed. Run: node tools/diagnostics/integration.check.js
const path = require('path');
const cfg = require(path.resolve(__dirname, '../../src/config'));
const { isSafeHttpUrl } = require(path.resolve(__dirname, '../../src/util'));
const { pass, warn, fail, skip, diagPool, timedFetch, runGroup, printGroup, summarize } = require('./lib');

async function build() {
  const pool = diagPool(cfg.databaseUrl);
  let row = null, loaded = false;

  const checks = [
    { title: 'integration_config row is present', run: async () => {
      try {
        row = (await pool.query('select * from integration_config where id=1')).rows[0];
        loaded = true;
        return row ? pass('integration_config present', 'singleton row exists') : fail('integration_config present', 'row id=1 missing', 'Run migration_017 (its insert seeds the singleton row).');
      } catch (e) { return fail('integration_config present', e.message, 'Cannot read integration_config — check DB connectivity (run the db checks).'); }
    } },
    { title: 'Audit forward target is safe and reachable (if enabled)', run: async () => {
      if (!loaded || !row) return skip('Audit forward target', 'config not loaded');
      if (!row.forward_enabled) return skip('Audit forward target', 'forwarding disabled');
      if (!row.forward_url) return fail('Audit forward target', 'enabled but no URL', 'Set a forward URL or disable forwarding.');
      if (!isSafeHttpUrl(row.forward_url)) return fail('Audit forward target', `unsafe URL: ${row.forward_url}`, 'Forward URL must be http(s) and not loopback/link-local (SSRF guard blocks it at send time).');
      try { const res = await timedFetch(row.forward_url, { method: 'OPTIONS' }, 5000); return pass('Audit forward target', `reachable (HTTP ${res.status})`); }
      catch (e) { return warn('Audit forward target', `not reachable: ${e.message}`, 'The webhook host is unreachable from the API — forwarded events will be dropped.'); }
    } },
    { title: 'Last forward status', run: async () => {
      if (!loaded || !row || !row.forward_enabled) return skip('Last forward status', 'forwarding disabled');
      if (!row.last_forward_status) return warn('Last forward status', 'never forwarded yet', 'No event has been forwarded — send a test from Integrations.');
      return row.last_forward_status === 'ok' ? pass('Last forward status', 'ok') : warn('Last forward status', row.last_forward_status, 'Most recent forward did not succeed — inspect the webhook.');
    } },
    { title: 'Consumer feed configuration', run: async () => {
      if (!loaded || !row) return skip('Consumer feed', 'config not loaded');
      if (!row.feed_enabled) return skip('Consumer feed', 'feed disabled');
      return row.feed_api_key ? pass('Consumer feed', 'enabled with an API key') : fail('Consumer feed', 'enabled but no API key', 'Rotate/generate the feed key (POST /api/integrations/feed-key) or /feed/audit returns 404.');
    } },
  ];

  return { pool, group: { id: 'integration', title: 'Outbound integrations (forward + feed)', checks } };
}

module.exports = { build };
if (require.main === module) {
  (async () => {
    const { pool, group } = await build();
    const results = await runGroup(group);
    const json = process.argv.includes('--json');
    if (json) process.stdout.write(JSON.stringify({ group: group.id, results }, null, 2) + '\n');
    else printGroup(group, results);
    await pool.end();
    process.exit(json ? (results.some((r) => r.status === 'fail') ? 2 : 0) : summarize(results));
  })();
}
