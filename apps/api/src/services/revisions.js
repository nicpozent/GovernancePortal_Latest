// ============================================================
//  Immutable content revisions (ADR-121, findings #4/#9).
//
//  A "revision" is an append-only, content-addressed snapshot of a policy's
//  content, frozen LOCALLY (bytes copied + sha256 hashed) so an acknowledgement
//  binds to reproducible content that survives independently of SharePoint or a
//  later in-place edit.
//
//  ensureRevision(policyId) returns the CURRENT frozen revision, freezing one on
//  first use and caching it on policies.current_revision_id so the signing
//  hot-path does not re-hash every time. It is idempotent and safe under
//  concurrency: the heavy byte I/O runs OUTSIDE any DB lock, and a short locked
//  section commits the pointer, deduping on the content hash if a concurrent
//  caller won the race.
//
//  Returns null when there is genuinely nothing to freeze (a link-only policy
//  with no resolvable document, or an upload whose file is missing) — the caller
//  then records the signature without a revision binding, exactly as before.
//  THROWS when a freezable policy's content cannot be captured (e.g. SharePoint
//  briefly unavailable) so the caller can refuse to record an unbound signature.
// ============================================================
const path = require('path');
const { pool } = require('../db');
const storage = require('../storage');
const { getPolicyDocument, getPolicyContentStream } = require('./sharepoint');

async function ensureRevision(policyId, opts = {}) {
  const actorOid = opts.actorOid || null;
  const p = (await pool.query(
    `select id, version, source, upload_path, upload_mime,
            sharepoint_drive_id, sharepoint_item_id, current_revision_id
       from policies where id=$1`, [policyId])).rows[0];
  if (!p) return null;

  // Fast path: the current content is already frozen.
  if (p.current_revision_id) {
    const r = (await pool.query('select * from policy_revisions where id=$1', [p.current_revision_id])).rows[0];
    if (r) return r;
  }

  // Freeze the current bytes locally (hash while copying). Throws on a fetch/IO
  // failure for a freezable policy; returns null when there is nothing to freeze.
  let frozen, source, spVersion = null, mime = null;
  if (p.source === 'Upload') {
    if (!p.upload_path || !(await storage.exists(p.upload_path))) return null;
    source = 'Upload';
    mime = p.upload_mime || null;
    frozen = await storage.finalizeFrozen(storage.openReadStream(p.upload_path), path.extname(p.upload_path) || '');
  } else {
    if (!p.sharepoint_drive_id || !p.sharepoint_item_id) return null; // link-only: no fetchable bytes
    source = 'SharePoint';
    // Capture the version label + native filename extension for provenance; the
    // frozen bytes are the NATIVE source-of-record document, not a rendered PDF.
    let meta = null;
    try { meta = await getPolicyDocument(p.sharepoint_drive_id, p.sharepoint_item_id); } catch (_) { /* fall back to policy.version */ }
    spVersion = (meta && meta.version) || p.version;
    const ext = path.extname((meta && meta.name) || '') || '';
    const stream = await getPolicyContentStream(p.sharepoint_drive_id, p.sharepoint_item_id, false);
    frozen = await storage.finalizeFrozen(stream, ext);
  }

  // Commit the revision under a short row lock; dedupe on the content hash so a
  // concurrent freeze of identical bytes collapses to one revision.
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('select id from policies where id=$1 for update', [policyId]);
    let rev = (await client.query(
      'select * from policy_revisions where policy_id=$1 and content_sha256=$2', [policyId, frozen.sha256])).rows[0];
    if (rev) {
      await storage.remove(frozen.key);                  // lost the race — drop our duplicate file
    } else {
      rev = (await client.query(
        `insert into policy_revisions
           (policy_id, version_label, source, sharepoint_drive_id, sharepoint_item_id, sharepoint_version,
            upload_path, content_sha256, content_size, content_mime, integrity, frozen_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'verified',$11) returning *`,
        [policyId, p.version, source, p.sharepoint_drive_id || null, p.sharepoint_item_id || null, spVersion,
         frozen.key, frozen.sha256, frozen.size, mime, actorOid])).rows[0];
    }
    await client.query('update policies set current_revision_id=$2 where id=$1', [policyId, rev.id]);
    await client.query('commit');
    return rev;
  } catch (e) {
    try { await client.query('rollback'); } catch (_) { /* ignore */ }
    try { await storage.remove(frozen.key); } catch (_) { /* don't leak the frozen file */ }
    throw e;
  } finally { client.release(); }
}

module.exports = { ensureRevision };
