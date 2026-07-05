// ============================================================
//  Pluggable object storage for uploaded training files.
//
//  The multipart upload is streamed to local disk by multer first (never held
//  in memory — safe for large files). storage.finalize() then persists it to
//  the configured backend and returns the storage KEY that is saved as
//  policies.upload_path.
//
//  Drivers:
//    - 'local' (default): files live on the /uploads volume, exactly as before.
//      Zero behaviour change for the current single-host deployment.
//    - 'blob': files are uploaded to Azure Blob so ANY API replica can serve
//      them (the enabler for multi-instance / HA). @azure/storage-blob is
//      lazy-required, so it's only needed when STORAGE_DRIVER=blob.
//
//  Interface (all keys are the stored filename, e.g. "<uuid>.pdf"):
//    finalize(file)      -> key            (persist the just-uploaded temp file)
//    exists(key)         -> boolean
//    openReadStream(key) -> Readable
//    remove(key)         -> void           (best-effort)
// ============================================================
const fs = require('fs');
const path = require('path');
const cfg = require('./config');

const UPLOAD_DIR = cfg.uploadDir;

// ── local disk (default) ─────────────────────────────────────
function localDriver() {
  const full = (key) => path.join(UPLOAD_DIR, path.basename(key));
  return {
    driver: 'local',
    async finalize(file) { return file.filename; },     // multer already wrote it here
    async exists(key) { try { return fs.existsSync(full(key)); } catch { return false; } },
    openReadStream(key) { return fs.createReadStream(full(key)); },
    async remove(key) { try { fs.unlinkSync(full(key)); } catch (_) { /* best-effort */ } },
  };
}

// ── Azure Blob (opt-in; lazy-loaded) ─────────────────────────
function blobDriver() {
  let BlobServiceClient, DefaultAzureCredential;
  try {
    ({ BlobServiceClient } = require('@azure/storage-blob'));
    ({ DefaultAzureCredential } = require('@azure/identity'));
  } catch (e) {
    throw new Error("STORAGE_DRIVER=blob requires '@azure/storage-blob' (npm i @azure/storage-blob)", { cause: e });
  }
  const s = cfg.storage;
  const service = s.blobConnectionString
    ? BlobServiceClient.fromConnectionString(s.blobConnectionString)
    : new BlobServiceClient(s.blobAccountUrl, new DefaultAzureCredential());
  const container = service.getContainerClient(s.blobContainer);
  const stagingPath = (key) => path.join(UPLOAD_DIR, path.basename(key));
  return {
    driver: 'blob',
    async finalize(file) {
      const key = file.filename;
      const local = stagingPath(key);
      await container.getBlockBlobClient(key).uploadFile(local);
      try { fs.unlinkSync(local); } catch (_) { /* drop the staging copy */ }
      return key;
    },
    async exists(key) { return container.getBlockBlobClient(path.basename(key)).exists(); },
    openReadStream(key) {
      // Returns a Readable; callers pipe it. Any download error surfaces as a
      // stream 'error' the route handles (404/500).
      const { PassThrough } = require('stream');
      const out = new PassThrough();
      container.getBlockBlobClient(path.basename(key)).download()
        .then((resp) => resp.readableStreamBody.pipe(out))
        .catch((err) => out.destroy(err));
      return out;
    },
    async remove(key) { try { await container.getBlockBlobClient(path.basename(key)).deleteIfExists(); } catch (_) {} },
  };
}

const storage = cfg.storage.driver === 'blob' ? blobDriver() : localDriver();

module.exports = storage;
