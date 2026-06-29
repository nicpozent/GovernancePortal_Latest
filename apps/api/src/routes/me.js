// Generated from the former monolithic routes.js — handler bodies are verbatim.
const { pool } = require('../db');
const cfg = require('../config');
const { logger, forwardEvent } = require('../logger');
const { requireAdmin, requireManager } = require('../auth');
const { runSync } = require('../services/sync');
const { runReminders, sendMail } = require('../services/reminders');
const { getPolicyDocument, resolveSharingUrl, listLibraries, listFolder } = require('../services/sharepoint');
const { escapeHtml, isSafeHttpUrl, pgEnvFrom } = require('../util');
const { isAdmin, isManager, audit, teamOids, canManage, canRead } = require('../authz');
const { UPLOAD_DIR, UPLOAD_TYPES, uploadMw, withUpload, MGR_DOC_TYPES } = require('../uploads');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const BACKUP_DIR = '/backups';

module.exports = (r) => {
// ── whoami: drives the role switcher + persona chip ──────────
r.get('/me', async (req, res) => {
  const e = await pool.query('select * from employees where oid = $1', [req.user.oid]);
  res.json({
    identity: req.user,
    profile: e.rows[0] || null,
    isAdmin: isAdmin(req),
    isManager: isManager(req),
  });
});
};
