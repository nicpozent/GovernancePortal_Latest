// Integration / regression net for the training upload → serve → replace path
// (HA storage abstraction). Exercises the LOCAL storage driver end-to-end so
// the refactor to a pluggable backend is verified to preserve behaviour:
//   POST /api/trainings (file)  -> stored, key saved as upload_path
//   GET  /api/policies/:id/file -> served with server-derived Content-Type
//   PUT  /api/trainings/:id (file) -> replaces the file, old one removed
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const db = require('../helpers/db');
const h = require('../helpers/app');
const cfg = require('../../src/config');

let dbUp = false;
test.before(async () => { dbUp = await db.available(); if (dbUp) await db.applyAll(); });
test.beforeEach(async () => { if (dbUp) await db.truncate(); });
test.after(async () => { await db.end(); try { await h.pool.end(); } catch (_) {} });

const PDF = Buffer.from('%PDF-1.4 fake pdf body for tests\n');

// superagent doesn't buffer non-JSON/text bodies by default — collect the raw
// bytes so we can byte-compare what the storage layer served.
const binaryParser = (res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(Buffer.from(c)));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};
const getFile = (id) => request(h.app).get(`/api/policies/${id}/file`).buffer().parse(binaryParser);

test('training upload is stored on the local driver and served back verbatim', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const mgr = await db.seedEmployee({ name: 'Mgr' });
  h.asManager(mgr);

  const created = await request(h.app)
    .post('/api/trainings')
    .field('name', 'Fire Safety')
    .field('docType', 'Training')
    .attach('file', PDF, { filename: 'fire.pdf', contentType: 'application/pdf' });
  assert.equal(created.status, 201);
  const id = created.body.id;
  const key = created.body.upload_path;
  assert.ok(key, 'upload_path (storage key) should be set');
  // Local driver: the key is a filename under the configured upload dir.
  assert.ok(fs.existsSync(path.join(cfg.uploadDir, key)), 'file should exist on disk');

  // Owner can read their own training file; Content-Type is server-derived.
  const served = await getFile(id);
  assert.equal(served.status, 200);
  assert.equal(served.headers['content-type'], 'application/pdf');
  assert.equal(served.headers['x-content-type-options'], 'nosniff');
  assert.deepEqual(served.body, PDF);
});

test('serving is denied for a non-member and 404 when the file is missing', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const mgr = await db.seedEmployee({ name: 'Mgr' });
  const outsider = await db.seedEmployee({ name: 'Out' });
  h.asManager(mgr);
  const created = await request(h.app)
    .post('/api/trainings')
    .field('name', 'Confidential')
    .attach('file', PDF, { filename: 'x.pdf', contentType: 'application/pdf' });
  const id = created.body.id;

  // A regular user with no assignment must not read it.
  h.asUser(outsider, []);
  assert.equal((await request(h.app).get(`/api/policies/${id}/file`)).status, 403);

  // If the backing file disappears, the route reports missing_file (not a crash).
  fs.unlinkSync(path.join(cfg.uploadDir, created.body.upload_path));
  h.asManager(mgr);
  const gone = await request(h.app).get(`/api/policies/${id}/file`);
  assert.equal(gone.status, 404);
  assert.equal(gone.body.error, 'missing_file');
});

test('replacing the file on update removes the superseded one', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const mgr = await db.seedEmployee({ name: 'Mgr' });
  h.asManager(mgr);
  const created = await request(h.app)
    .post('/api/trainings')
    .field('name', 'Handbook')
    .attach('file', PDF, { filename: 'v1.pdf', contentType: 'application/pdf' });
  const id = created.body.id;
  const oldKey = created.body.upload_path;

  const NEW = Buffer.from('%PDF-1.4 replacement body\n');
  const updated = await request(h.app)
    .put(`/api/trainings/${id}`)
    .field('name', 'Handbook')
    .field('version', 'v2.0')
    .attach('file', NEW, { filename: 'v2.pdf', contentType: 'application/pdf' });
  assert.equal(updated.status, 200);
  const newKey = updated.body.upload_path;
  assert.notEqual(newKey, oldKey, 'a new storage key should be assigned');
  assert.ok(fs.existsSync(path.join(cfg.uploadDir, newKey)), 'new file present');
  assert.ok(!fs.existsSync(path.join(cfg.uploadDir, oldKey)), 'old file removed');

  const served = await getFile(id);
  assert.deepEqual(served.body, NEW);
});

test('non-owner manager cannot update another manager\'s training', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const mgr = await db.seedEmployee({ name: 'Owner' });
  const other = await db.seedEmployee({ name: 'Other' });
  h.asManager(mgr);
  const created = await request(h.app)
    .post('/api/trainings')
    .field('name', 'Mine')
    .attach('file', PDF, { filename: 'a.pdf', contentType: 'application/pdf' });
  const id = created.body.id;

  h.asManager(other);
  const before = fs.readdirSync(cfg.uploadDir).length;
  const res = await request(h.app)
    .put(`/api/trainings/${id}`)
    .field('name', 'Hijack')
    .attach('file', PDF, { filename: 'b.pdf', contentType: 'application/pdf' });
  assert.equal(res.status, 403);
  // #18: the rejected upload's staged file must be cleaned up, not orphaned.
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(fs.readdirSync(cfg.uploadDir).length, before, 'no orphaned staged file left behind');
});
