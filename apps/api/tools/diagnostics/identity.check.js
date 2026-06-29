// Subsystem: Entra ID reachability (token validation depends on it).
// Run: node tools/diagnostics/identity.check.js
const path = require('path');
const cfg = require(path.resolve(__dirname, '../../src/config'));
const { pass, warn, fail, timedFetch, runStandalone } = require('./lib');

const group = {
  id: 'identity',
  title: 'Identity / Entra ID reachability',
  checks: [
    { title: 'JWKS endpoint reachable and serving signing keys', run: async () => {
      try {
        const res = await timedFetch(cfg.jwksUri, {}, 6000);
        if (!res.ok) return fail('JWKS endpoint reachable', `HTTP ${res.status} from ${cfg.jwksUri}`, 'The API cannot fetch signing keys, so every token check will 401. Check tenant ID and outbound HTTPS to login.microsoftonline.com.');
        const body = await res.json();
        const n = (body.keys || []).length;
        return n > 0 ? pass('JWKS endpoint reachable', `${n} keys`) : warn('JWKS endpoint reachable', 'no keys returned', 'Unexpected JWKS payload — verify the tenant ID.');
      } catch (e) { return fail('JWKS endpoint reachable', e.message, 'No outbound HTTPS to login.microsoftonline.com? Check egress/proxy/firewall. Token validation will fail.'); }
    } },
    { title: 'OpenID configuration reachable', run: async () => {
      const url = `https://login.microsoftonline.com/${cfg.tenantId}/v2.0/.well-known/openid-configuration`;
      try {
        const res = await timedFetch(url, {}, 6000);
        if (!res.ok) return warn('OpenID configuration reachable', `HTTP ${res.status}`, 'Discovery endpoint not returning 200 — check the tenant ID.');
        const body = await res.json();
        if (body.issuer && body.issuer !== cfg.issuer) return warn('OpenID configuration reachable', `issuer mismatch: discovery=${body.issuer} config=${cfg.issuer}`, 'Configured issuer differs from the tenant discovery document.');
        return pass('OpenID configuration reachable', 'issuer matches config');
      } catch (e) { return warn('OpenID configuration reachable', e.message, 'Could not reach the discovery endpoint (non-fatal if JWKS works).'); }
    } },
  ],
};

module.exports = group;
if (require.main === module) runStandalone(group);
