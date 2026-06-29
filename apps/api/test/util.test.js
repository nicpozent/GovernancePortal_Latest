// Unit tests for the pure helpers. Run: `npm test` (node:test, no deps, no DB).
const test = require('node:test');
const assert = require('node:assert/strict');
const { escapeHtml, isSafeHttpUrl, pgEnvFrom, milestoneFor } = require('../src/util');

test('escapeHtml neutralizes markup-significant characters', () => {
  assert.equal(escapeHtml(`<script>alert('x')&"`), '&lt;script&gt;alert(&#39;x&#39;)&amp;&quot;');
  assert.equal(escapeHtml('plain name'), 'plain name');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(42), '42');
});

test('isSafeHttpUrl allows public/internal http(s) targets', () => {
  assert.equal(isSafeHttpUrl('https://siem.example.com/ingest'), true);
  assert.equal(isSafeHttpUrl('http://10.0.0.5:9000/webhook'), true);   // RFC-1918 allowed by design
});

test('isSafeHttpUrl blocks loopback, link-local and bad schemes', () => {
  assert.equal(isSafeHttpUrl('http://localhost/x'), false);
  assert.equal(isSafeHttpUrl('http://127.0.0.1/x'), false);
  assert.equal(isSafeHttpUrl('http://169.254.169.254/latest/meta-data'), false); // cloud metadata
  assert.equal(isSafeHttpUrl('http://[::1]/x'), false);
  assert.equal(isSafeHttpUrl('ftp://example.com/x'), false);
  assert.equal(isSafeHttpUrl('file:///etc/passwd'), false);
  assert.equal(isSafeHttpUrl('not a url'), false);
  assert.equal(isSafeHttpUrl(''), false);
});

test('pgEnvFrom maps a connection string to PG* env without leaking into argv', () => {
  const env = pgEnvFrom('postgres://user:p%40ss@db.host:6432/governance', { PATH: '/bin' });
  assert.equal(env.PGHOST, 'db.host');
  assert.equal(env.PGPORT, '6432');
  assert.equal(env.PGUSER, 'user');
  assert.equal(env.PGPASSWORD, 'p@ss');          // url-decoded
  assert.equal(env.PGDATABASE, 'governance');
  assert.equal(env.PATH, '/bin');                // base env preserved
});

test('milestoneFor follows the assigned → due → overdue ladder', () => {
  assert.equal(milestoneFor(30, false), 'assigned'); // first contact wins
  assert.equal(milestoneFor(30, true), null);        // assigned sent, far from due
  assert.equal(milestoneFor(null, true), null);      // no deadline
  assert.equal(milestoneFor(-1, true), 'overdue');
  assert.equal(milestoneFor(0, true), 'due-1');
  assert.equal(milestoneFor(5, true), 'due-7');
  assert.equal(milestoneFor(12, true), 'due-15');
  assert.equal(milestoneFor(18, true), 'due-20');
});
