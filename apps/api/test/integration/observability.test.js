// Observability endpoints: readiness checks the DB, /metrics exposes Prometheus
// RED metrics, and a served request is actually recorded. Liveness stays static.
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const db = require('../helpers/db');
const h = require('../helpers/app');

let dbUp = false;
test.before(async () => { dbUp = await db.available(); if (dbUp) await db.applyAll(); });
test.after(async () => { await db.end(); try { await h.pool.end(); } catch (_) {} });

test('GET /healthz is static liveness (no DB dependency)', async () => {
  const res = await request(h.app).get('/healthz');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
});

test('GET /readyz reports DB readiness', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const res = await request(h.app).get('/readyz');
  assert.equal(res.status, 200);
  assert.equal(res.body.db, 'up');
});

test('GET /metrics exposes Prometheus RED + runtime metrics, and records traffic', async () => {
  // Generate a request so the histogram/counter have a sample.
  await request(h.app).get('/healthz');
  const res = await request(h.app).get('/metrics');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /text\/plain/);
  // RED signals present.
  assert.match(res.text, /http_request_duration_seconds/);
  assert.match(res.text, /http_requests_total/);
  // Node runtime metrics present (default collectors).
  assert.match(res.text, /process_cpu_seconds_total/);
  assert.match(res.text, /nodejs_/);
  // The /healthz hit was recorded with its route label, not the raw URL.
  assert.match(res.text, /route="\/healthz"/);
});
