// ============================================================
//  Entra ID token validation
//  Verifies the Bearer access token the SPA sends with every
//  request: signature (JWKS), audience (this API), issuer (tenant).
//  Roles come from App Roles assigned in Entra.
// ============================================================
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const cfg = require('./config');

const client = jwksClient({
  jwksUri: cfg.jwksUri,
  cache: true,
  cacheMaxAge: 24 * 60 * 60 * 1000,
  rateLimit: true,
});

function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
}

// Require a valid signed-in user.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing_token' });

  jwt.verify(
    token,
    getKey,
    {
      audience: [cfg.apiClientId, cfg.apiAudience],
      issuer: cfg.issuer,
      algorithms: ['RS256'],
    },
    (err, claims) => {
      if (err) return res.status(401).json({ error: 'invalid_token', detail: err.message });
      // ── Token hardening ──────────────────────────────────────
      // 1) must be issued by OUR tenant
      if (claims.tid && claims.tid !== cfg.tenantId) {
        return res.status(401).json({ error: 'invalid_token', detail: 'wrong_tenant' });
      }
      const scopes = (claims.scp || '').split(' ').filter(Boolean);
      const roles = claims.roles || [];
      // 2) Must be a DELEGATED user token carrying our API scope.
      //    App-only (client-credentials) tokens have no `scp` and set
      //    idtyp='app' — reject them here even if they carry app roles, so a
      //    service principal granted an app role can't act as a user/admin.
      //    (SCIM provisioning uses its own bearer at /scim/v2, not this guard.)
      if (claims.idtyp === 'app' || !scopes.includes('access_as_user')) {
        return res.status(403).json({ error: 'insufficient_scope', detail: 'delegated access_as_user token required' });
      }
      req.user = {
        oid: claims.oid,                          // stable Entra object id
        name: claims.name,                        // display name
        upn: claims.preferred_username,           // user principal name / email
        roles,                                    // App Roles (e.g. ['Governance.Admin'])
        scopes,
      };
      next();
    }
  );
}

// Require the Governance.Admin App Role.
function requireAdmin(req, res, next) {
  if (!req.user || !req.user.roles.includes(cfg.adminAppRole)) {
    return res.status(403).json({ error: 'forbidden', detail: 'admin role required' });
  }
  next();
}

// Require Manager OR Admin (managers own trainings; admins can do everything).
function requireManager(req, res, next) {
  if (!req.user || !(req.user.roles.includes(cfg.managerAppRole) || req.user.roles.includes(cfg.adminAppRole))) {
    return res.status(403).json({ error: 'forbidden', detail: 'manager role required' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin, requireManager };
