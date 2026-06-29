// Subsystem: web tier (TLS cert, runtime SPA config, security headers).
// Best run in the WEB container or on the host (cert + config.js live there).
// Env: DIAG_CERTS_DIR (default /etc/nginx/certs), DIAG_CONFIG_JS
// (default /usr/share/nginx/html/config.js), DIAG_WEB_URL (optional).
// Run: node tools/diagnostics/web.check.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { X509Certificate } = require('crypto');
const { pass, warn, fail, skip, timedFetch, runStandalone } = require('./lib');

const CERTS = process.env.DIAG_CERTS_DIR || '/etc/nginx/certs';
const CONFIG_JS = process.env.DIAG_CONFIG_JS || '/usr/share/nginx/html/config.js';
const WEB_URL = process.env.DIAG_WEB_URL || '';

const group = {
  id: 'web',
  title: 'Web tier (nginx / TLS / SPA config)',
  checks: [
    { title: 'TLS certificate present and not expiring soon', run: async () => {
      const file = path.join(CERTS, 'fullchain.pem');
      if (!fs.existsSync(file)) return skip('TLS certificate', `${file} not found here`, 'Run this in the web container or set DIAG_CERTS_DIR to where fullchain.pem lives.');
      try {
        const cert = new X509Certificate(fs.readFileSync(file));
        const days = (Date.parse(cert.validTo) - Date.now()) / 8.64e7;
        if (days < 0) return fail('TLS certificate', `expired ${(-days).toFixed(0)} days ago`, 'Replace deploy/certs/fullchain.pem + privkey.pem; HTTPS is broken until then.');
        if (days < 30) return warn('TLS certificate', `expires in ${days.toFixed(0)} days`, 'Renew the certificate soon.');
        return pass('TLS certificate', `valid for ${days.toFixed(0)} more days (CN ${cert.subject.replace(/\n/g, ' ')})`);
      } catch (e) { return fail('TLS certificate', e.message, 'fullchain.pem is not a readable certificate.'); }
    } },
    { title: 'Runtime SPA config (config.js) is populated', run: async () => {
      if (!fs.existsSync(CONFIG_JS)) return skip('Runtime SPA config', `${CONFIG_JS} not found here`, 'Run in the web container or set DIAG_CONFIG_JS.');
      try {
        const ctx = { window: {} };
        vm.runInNewContext(fs.readFileSync(CONFIG_JS, 'utf8'), ctx, { timeout: 1000 });
        const c = ctx.window.APP_CONFIG || {};
        const missing = ['TENANT_ID', 'SPA_CLIENT_ID', 'API_CLIENT_ID'].filter((k) => !c[k]);
        if (missing.length) return fail('Runtime SPA config', `empty: ${missing.join(', ')}`, 'The container env (AZURE_TENANT_ID/SPA_CLIENT_ID/API_CLIENT_ID) was not passed — 40-envconfig.sh produced blanks, so sign-in cannot start.');
        return pass('Runtime SPA config', `tenant+SPA+API ids set`);
      } catch (e) { return fail('Runtime SPA config', e.message, 'config.js did not parse.'); }
    } },
    { title: 'Security headers present (via DIAG_WEB_URL)', run: async () => {
      if (!WEB_URL) return skip('Security headers', 'set DIAG_WEB_URL to check (e.g. https://localhost)');
      try {
        const res = await timedFetch(`${WEB_URL.replace(/\/$/, '')}/healthz`, {}, 6000);
        const want = ['strict-transport-security', 'x-content-type-options', 'content-security-policy'];
        const missing = want.filter((h) => !res.headers.get(h));
        if (missing.length) return warn('Security headers', `missing: ${missing.join(', ')}`, 'Check the add_header directives in nginx.conf.');
        return pass('Security headers', 'HSTS, nosniff, CSP present');
      } catch (e) {
        if (/self-signed|certificate/i.test(e.message)) return warn('Security headers', 'TLS cert not trusted by Node', 'Self-signed cert — expected locally; verify in a browser or set NODE_EXTRA_CA_CERTS.');
        return warn('Security headers', e.message, `Could not reach ${WEB_URL}.`);
      }
    } },
  ],
};

module.exports = group;
if (require.main === module) runStandalone(group);
