// ============================================================
//  Authenticated smoke journey (#23) — exercises the REAL token-validation
//  path end to end, unlike the integration tests (which stub requireAuth).
//
//  It stands up a local mock JWKS issuer, signs an RS256 access token with a
//  freshly generated key, and drives the real Express app: the request goes
//  through jwt.verify → JWKS signature check → tenant/audience/issuer/scope
//  rules → an authenticated endpoint. Tampered and missing tokens are rejected.
//
//  No production auth bypass exists: this works purely by pointing JWKS_URI /
//  TOKEN_ISSUER (real config knobs) at the mock and signing a genuine token.
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const crypto = require('crypto');

// ── env MUST be set before requiring config/app (config reads env at import) ──
const TENANT = 'smoke-tenant';
const AUD = 'smoke-api-client';
const ISSUER = 'https://mock-issuer.local/v2.0';
const KID = 'smoke-key-1';

process.env.AZURE_TENANT_ID = TENANT;
process.env.API_CLIENT_ID = AUD;
process.env.TOKEN_ISSUER = ISSUER;
process.env.NODE_ENV = 'test';

// Generate the signing key and expose its public half as a JWKS document.
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: KID, use: 'sig', alg: 'RS256' };
const privatePem = privateKey.export({ format: 'pem', type: 'pkcs8' });

let jwksServer, db, app, request, jwt;

const signToken = (over = {}) => jwt.sign(
  { tid: TENANT, scp: 'access_as_user', roles: ['Governance.Admin'],
    oid: '00000000-0000-4000-8000-0000000000aa', name: 'Smoke Admin', preferred_username: 'smoke@x', ...over },
  privatePem, { algorithm: 'RS256', keyid: KID, audience: AUD, issuer: ISSUER, subject: 'smoke', expiresIn: '5m' });

let dbUp = false;
test.before(async () => {
  // Serve JWKS on an ephemeral port, then point the API's validator at it.
  jwksServer = http.createServer((req, res) => {
    if (req.url.startsWith('/keys')) { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ keys: [jwk] })); }
    res.statusCode = 404; res.end();
  });
  await new Promise((r) => jwksServer.listen(0, '127.0.0.1', r));
  process.env.JWKS_URI = `http://127.0.0.1:${jwksServer.address().port}/keys`;

  db = require('../helpers/db');
  dbUp = await db.available();
  if (dbUp) await db.applyAll();
  jwt = require('jsonwebtoken');
  app = require('../../src/app');          // the REAL app — real requireAuth, no stub
  request = require('supertest');
});
test.after(async () => {
  if (jwksServer) await new Promise((r) => jwksServer.close(r));
  try { if (db) await db.end(); } catch (_) { /* ignore */ }
  try { const { pool } = require('../../src/db'); await pool.end(); } catch (_) { /* ignore */ }
});

test('a genuinely signed admin token passes real JWKS validation and reaches an authed endpoint', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const res = await request(app).get('/api/policies').set('Authorization', `Bearer ${signToken()}`);
  assert.equal(res.status, 200, 'the signed token was verified against the mock JWKS and accepted');
  assert.ok(Array.isArray(res.body));
});

test('a request with no token is rejected', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const res = await request(app).get('/api/policies');
  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'missing_token');
});

test('a tampered token fails signature verification', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const good = signToken();
  const tampered = good.slice(0, -6) + (good.slice(-6) === 'AAAAAA' ? 'BBBBBB' : 'AAAAAA');
  const res = await request(app).get('/api/policies').set('Authorization', `Bearer ${tampered}`);
  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'invalid_token');
});

test('an app-only token (no access_as_user scope) is refused', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const res = await request(app).get('/api/policies').set('Authorization', `Bearer ${signToken({ scp: undefined, idtyp: 'app' })}`);
  assert.equal(res.status, 403);
  assert.equal(res.body.error, 'insufficient_scope');
});
