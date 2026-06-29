// Subsystem: Microsoft Graph reachability + config (directory sync, SharePoint,
// mail all depend on it). Run: node tools/diagnostics/graph.check.js
// A real authenticated Graph call is only attempted with --deep (needs creds).
const path = require('path');
const cfg = require(path.resolve(__dirname, '../../src/config'));
const { pass, warn, fail, skip, timedFetch, runStandalone } = require('./lib');

const deep = process.argv.includes('--deep');

const group = {
  id: 'graph',
  title: 'Microsoft Graph integration',
  checks: [
    { title: 'graph.microsoft.com reachable (egress)', run: async () => {
      try {
        // An unauthenticated call returns 401 — which still proves reachability.
        const res = await timedFetch('https://graph.microsoft.com/v1.0/$metadata', {}, 6000);
        return res.status ? pass('Graph reachable', `responded HTTP ${res.status}`) : warn('Graph reachable', 'no status');
      } catch (e) { return fail('Graph reachable', e.message, 'No outbound HTTPS to graph.microsoft.com — directory sync, SharePoint and email will fail. Check egress/proxy.'); }
    } },
    { title: 'SharePoint site id configured', run: async () =>
      cfg.graph.sharepointSiteId ? pass('SharePoint site id configured', cfg.graph.sharepointSiteId)
        : warn('SharePoint site id configured', 'missing', 'Set SHAREPOINT_SITE_ID or document browse/preview will 502.') },
    { title: 'Authenticated Graph call (token + site read)', run: async () => {
      if (!deep) return skip('Authenticated Graph call', 'skipped — pass --deep to attempt (uses real credentials)');
      try {
        const graph = require(path.resolve(__dirname, '../../src/graph'));
        const me = await graph.api('/sites/' + (cfg.graph.sharepointSiteId || 'root')).get();
        return pass('Authenticated Graph call', `read site "${me.displayName || me.id || 'ok'}"`);
      } catch (e) { return fail('Authenticated Graph call', e.statusCode ? `HTTP ${e.statusCode}: ${e.code || e.message}` : e.message,
        'Credential or permission problem: check Managed Identity / client secret and the Sites.Selected grant on the site.'); }
    } },
  ],
};

module.exports = group;
if (require.main === module) runStandalone(group);
