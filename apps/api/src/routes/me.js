// Generated from the former monolithic routes.js — handler bodies are verbatim.
const { pool } = require('../db');
const { isAdmin, isManager } = require('../authz');

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
