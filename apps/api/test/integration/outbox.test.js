// Integration tests for the audit forwarding outbox (#13): audited actions
// enqueue a durable outbox row, and the drain worker delivers or skips it.
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const db = require('../helpers/db');
const h = require('../helpers/app');
const { drainOutbox } = require('../../src/services/outbox');
const { audit } = require('../../src/authz');

let dbUp = false;
test.before(async () => { dbUp = await db.available(); if (dbUp) await db.applyAll(); });
test.beforeEach(async () => { if (dbUp) await db.truncate(); });
test.after(async () => { await db.end(); try { await h.pool.end(); } catch (_) {} });

test('an audited action enqueues an outbox row; drain skips it when forwarding is off', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const admin = await db.seedEmployee({ name: 'Admin' });
  await db.superPool.query('update integration_config set forward_enabled=false where id=1');
  h.asAdmin(admin);
  assert.equal((await request(h.app).post('/api/groups').send({ name: 'Finance' })).status, 201); // audited: group.create

  const before = (await db.superPool.query('select status from audit_outbox')).rows;
  assert.ok(before.length >= 1, 'an outbox row was enqueued');
  assert.ok(before.every((r) => r.status === 'pending'), 'starts pending');

  await drainOutbox();
  const after = (await db.superPool.query('select status from audit_outbox')).rows;
  assert.ok(after.length >= 1 && after.every((r) => r.status === 'skipped'), 'forwarding off → skipped, not lost');
});

test('drain forwards pending events to the configured target when enabled', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const admin = await db.seedEmployee({ name: 'Admin' });
  await db.superPool.query("update integration_config set forward_enabled=true, forward_url='http://siem.internal/ingest' where id=1");
  h.asAdmin(admin);
  assert.equal((await request(h.app).post('/api/groups').send({ name: 'HR' })).status, 201);

  const realFetch = global.fetch;
  let got = null;
  global.fetch = async (url, opts) => { got = { url: String(url), body: opts && opts.body }; return { ok: true, status: 200 }; };
  try { await drainOutbox(); } finally { global.fetch = realFetch; }

  const rows = (await db.superPool.query('select status from audit_outbox')).rows;
  assert.ok(rows.length >= 1 && rows.every((r) => r.status === 'sent'), 'events marked sent');
  assert.ok(got && /siem\.internal/.test(got.url), 'forwarded to the configured url');
  assert.ok(got.body && /group\.create/.test(got.body), 'the audit event was the payload');
  const cfg = (await db.superPool.query('select last_forward_status from integration_config where id=1')).rows[0];
  assert.equal(cfg.last_forward_status, 'ok');
});

test('audit() inside a transaction throws on failure, so the mutation can roll back (#13)', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const client = await db.superPool.connect();
  const fakeReq = { user: { oid: null, name: 'x' }, ip: '127.0.0.1', id: 'test' };
  try {
    await client.query('begin');
    // action is NOT NULL — a null action makes the audit_log insert fail. Passing
    // a client (a transaction) means audit() must THROW rather than swallow, so
    // the caller's transaction aborts and its mutation rolls back with it.
    await assert.rejects(() => audit(fakeReq, null, 'target', null, client));
    await client.query('rollback');
  } finally { client.release(); }
});

test('a failed delivery is retried with backoff, not dropped', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const admin = await db.seedEmployee({ name: 'Admin' });
  await db.superPool.query("update integration_config set forward_enabled=true, forward_url='http://siem.internal/ingest' where id=1");
  h.asAdmin(admin);
  await request(h.app).post('/api/groups').send({ name: 'Ops' });

  const realFetch = global.fetch;
  global.fetch = async () => { throw new Error('connection refused'); };
  try { await drainOutbox(); } finally { global.fetch = realFetch; }

  const row = (await db.superPool.query('select status, attempts, next_attempt_at, last_error from audit_outbox order by id limit 1')).rows[0];
  assert.equal(row.status, 'pending', 'kept pending for retry');
  assert.equal(row.attempts, 1, 'attempt counted');
  assert.ok(new Date(row.next_attempt_at) > new Date(), 'backed off to a future retry');
  assert.match(row.last_error, /connection refused/);
});
