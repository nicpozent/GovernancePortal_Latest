// Unit tests for the token-hardening logic (no JWT/JWKS needed).
process.env.AZURE_TENANT_ID = process.env.AZURE_TENANT_ID || 'tenant-1';
const test = require('node:test');
const assert = require('node:assert/strict');
const { principalFromClaims } = require('../../src/auth');

const base = { tid: 'tenant-1', scp: 'access_as_user', oid: 'o1', name: 'A', preferred_username: 'a@x' };

test('accepts a delegated, same-tenant token and projects the principal', () => {
  const out = principalFromClaims({ ...base, roles: ['Governance.Admin'] });
  assert.equal(out.ok, true);
  assert.equal(out.user.oid, 'o1');
  assert.deepEqual(out.user.roles, ['Governance.Admin']);
  assert.deepEqual(out.user.scopes, ['access_as_user']);
});

test('rejects a foreign-tenant token (401 wrong_tenant)', () => {
  const out = principalFromClaims({ ...base, tid: 'other-tenant' });
  assert.equal(out.ok, false);
  assert.equal(out.status, 401);
  assert.equal(out.detail, 'wrong_tenant');
});

test('rejects an app-only token even when it carries an app role (403)', () => {
  const out = principalFromClaims({ ...base, idtyp: 'app', scp: '', roles: ['Governance.Admin'] });
  assert.equal(out.ok, false);
  assert.equal(out.status, 403);
  assert.equal(out.error, 'insufficient_scope');
});

test('rejects a token without the access_as_user scope (403)', () => {
  const out = principalFromClaims({ ...base, scp: 'openid profile' });
  assert.equal(out.ok, false);
  assert.equal(out.status, 403);
});

test('tolerates a missing tid (guard only fires when tid present and mismatched)', () => {
  const { tid, ...noTid } = base;
  const out = principalFromClaims(noTid);
  assert.equal(out.ok, true);
});

test('defaults roles to an empty array when absent', () => {
  const out = principalFromClaims(base);
  assert.deepEqual(out.user.roles, []);
});
