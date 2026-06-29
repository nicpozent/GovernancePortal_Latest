// ============================================================
//  API-test harness: builds the real Express app with the auth layer
//  stubbed so tests can act as a given principal. Only requireAuth is
//  replaced (to inject req.user); requireAdmin/requireManager remain the
//  REAL implementations, so role gating is genuinely exercised.
// ============================================================

// Config reads env at import — set test defaults before requiring anything.
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://governance_app:apppw@127.0.0.1:55432/governance';
process.env.AZURE_TENANT_ID = process.env.AZURE_TENANT_ID || 'test-tenant';
process.env.API_CLIENT_ID = process.env.API_CLIENT_ID || 'test-api';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const authPath = require.resolve('../../src/auth');
const realAuth = require('../../src/auth');

let testUser = null;
// Replace the cached auth module: keep the real role guards, stub requireAuth.
require.cache[authPath].exports = {
  ...realAuth,
  requireAuth: (req, res, next) => {
    if (!testUser) return res.status(401).json({ error: 'missing_token' });
    req.user = testUser;
    next();
  },
};

const app = require('../../src/app');
const { pool } = require('../../src/db');

const ROLES = { admin: ['Governance.Admin'], manager: ['Governance.Manager'], user: [] };

module.exports = {
  app,
  pool,
  // Set the acting principal for subsequent requests.
  asUser: (oid, roles = [], extra = {}) => { testUser = { oid, name: 'Test', upn: 'u@x', roles, scopes: ['access_as_user'], ...extra }; },
  asAdmin: (oid) => { testUser = { oid, name: 'Admin', upn: 'a@x', roles: ROLES.admin, scopes: ['access_as_user'] }; },
  asManager: (oid) => { testUser = { oid, name: 'Mgr', upn: 'm@x', roles: ROLES.manager, scopes: ['access_as_user'] }; },
  anon: () => { testUser = null; },
};
