// ============================================================
//  Upload handling for manager-uploaded trainings/documents.
//  Allowlist: extension -> safe, server-determined Content-Type. Anything not
//  here is rejected at upload, and HTML/SVG/scripts can never be stored or
//  served. Files are stored on the /uploads volume with random UUID names.
// ============================================================
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cfg = require('./config');

// Multer streams the upload here first (local staging even for the blob driver);
// storage.finalize() then persists it to the configured backend.
const UPLOAD_DIR = cfg.uploadDir;

// Ensure the staging directory exists (mirrors the backup-dir guard in admin.js).
// Without this, a deploy where UPLOAD_DIR isn't present/mounted — a fresh install,
// local dev, or a removed bind mount — fails EVERY upload with a multer ENOENT
// surfaced as "upload_failed", which reads to users as "couldn't upload the file".
try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); }
catch (e) { console.error(`[uploads] could not create UPLOAD_DIR (${UPLOAD_DIR}): ${e.message}`); }

const UPLOAD_TYPES = {
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
};
const uploadMw = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => { const ext = path.extname(file.originalname || '').toLowerCase().slice(0, 12); cb(null, crypto.randomUUID() + ext); },
  }),
  limits: {
    fileSize: 250 * 1024 * 1024,   // 250 MB cap
    files: 1,                       // exactly one uploaded file
    parts: 25,                      // the file + a handful of text fields
    fields: 24,                     // bound text field COUNT (blunts crafted-field DoS)
    fieldSize: 100 * 1024,          // 100 KB per text field
    fieldNameSize: 200,             // bound field NAME length
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (UPLOAD_TYPES[ext]) return cb(null, true);
    cb(new Error('Unsupported file type. Allowed: PDF, video (mp4/webm), PowerPoint, Word, image.'));
  },
}).single('file');
// Wrap multer so its errors return JSON instead of crashing the handler.
const withUpload = (req, res, next) => uploadMw(req, res, (err) => {
  if (err) return res.status(400).json({ error: 'upload_failed', detail: err.message });
  // Clean up the staged file if the request does NOT complete successfully —
  // the handler rejecting after multer already wrote the file (ownership /
  // validation failure), or the client aborting mid-request, would otherwise
  // leave an orphaned file on the /uploads volume. On a 2xx the file has been
  // finalized by the handler, so it is kept.
  res.on('close', () => {
    const ok = res.writableFinished && res.statusCode < 400;
    if (!ok && req.file && req.file.path) fs.unlink(req.file.path, () => {});
  });
  next();
});

// Document types a manager may upload.
const MGR_DOC_TYPES = ['Policy', 'Process', 'Procedure', 'Standard', 'Guideline', 'Training'];

module.exports = { UPLOAD_DIR, UPLOAD_TYPES, uploadMw, withUpload, MGR_DOC_TYPES };
