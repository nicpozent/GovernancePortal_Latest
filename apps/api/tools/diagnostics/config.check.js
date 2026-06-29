// Subsystem: configuration & environment. Run: node tools/diagnostics/config.check.js
const path = require('path');
const cfg = require(path.resolve(__dirname, '../../src/config'));
const { pass, warn, fail, skip, runStandalone } = require('./lib');

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isProd = process.env.NODE_ENV === 'production';

const group = {
  id: 'config',
  title: 'Configuration & environment',
  checks: [
    { title: 'AZURE_TENANT_ID is set and looks like a GUID', run: async () => {
      if (!cfg.tenantId) return fail('AZURE_TENANT_ID is set', 'missing', 'Set AZURE_TENANT_ID in apps/api/.env — token validation cannot work without it.');
      if (!GUID.test(cfg.tenantId)) return warn('AZURE_TENANT_ID is set', `value "${cfg.tenantId}" is not a GUID`, 'Confirm this is the tenant (directory) ID, not a name.');
      return pass('AZURE_TENANT_ID is set', cfg.tenantId);
    } },
    { title: 'API_CLIENT_ID is set', run: async () =>
      cfg.apiClientId ? pass('API_CLIENT_ID is set', cfg.apiClientId)
        : fail('API_CLIENT_ID is set', 'missing', 'Set API_CLIENT_ID — incoming tokens are validated against this audience.') },
    { title: 'DATABASE_URL is set and parseable', run: async () => {
      if (!cfg.databaseUrl) return fail('DATABASE_URL is set', 'missing', 'Set DATABASE_URL (compose builds it from APP_DB_PASSWORD).');
      try { const u = new URL(cfg.databaseUrl); return pass('DATABASE_URL is set', `${u.hostname}:${u.port || 5432}${u.pathname}`); }
      catch { return fail('DATABASE_URL is set', 'not a valid URL', 'Expected postgres://user:pass@host:5432/governance.'); }
    } },
    { title: 'FRONTEND_ORIGIN is configured for CORS', run: async () => {
      if (!cfg.frontendOrigin) return warn('FRONTEND_ORIGIN set', 'empty', 'Set FRONTEND_ORIGIN to the SPA origin (e.g. https://localhost).');
      if (isProd && /localhost/.test(cfg.frontendOrigin)) return warn('FRONTEND_ORIGIN set', cfg.frontendOrigin, 'Looks like a dev origin in production.');
      return pass('FRONTEND_ORIGIN set', cfg.frontendOrigin);
    } },
    { title: 'Graph credential strategy', run: async () => {
      const hasSecret = !!(cfg.graphClientId && cfg.clientSecret);
      if (isProd && hasSecret) return warn('Graph credential strategy', 'client secret present in production', 'Prefer Managed Identity (leave GRAPH_CLIENT_ID/AZURE_CLIENT_SECRET blank) so no secret is stored on disk.');
      if (!isProd && !hasSecret) return warn('Graph credential strategy', 'no client secret and not in Managed-Identity context', 'For local Graph access set GRAPH_CLIENT_ID + AZURE_CLIENT_SECRET; otherwise Graph calls will fail.');
      return pass('Graph credential strategy', hasSecret ? 'client secret (dev)' : 'DefaultAzureCredential / Managed Identity');
    } },
    { title: 'SharePoint site configured', run: async () =>
      cfg.graph.sharepointSiteId ? pass('SharePoint site configured', cfg.graph.sharepointSiteId)
        : warn('SharePoint site configured', 'SHAREPOINT_SITE_ID missing', 'Document preview/browse needs SHAREPOINT_SITE_ID; set it or expect 502s on /sharepoint/browse.') },
    { title: 'Reminder email sender configured', run: async () => {
      if (!cfg.graph.mailSender) return warn('Reminder sender configured', 'GRAPH_MAIL_SENDER missing', 'Reminders/confirmation emails are disabled until GRAPH_MAIL_SENDER is set.');
      if (!cfg.remindersEnabled) return skip('Reminder sender configured', 'sender set but REMINDERS_ENABLED=false');
      return pass('Reminder sender configured', cfg.graph.mailSender);
    } },
  ],
};

module.exports = group;
if (require.main === module) runStandalone(group);
