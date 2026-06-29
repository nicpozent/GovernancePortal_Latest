// ============================================================
//  SCIM 2.0 provisioning endpoint  —  THE LEAST-PRIVILEGE OPTION
//
//  With this enabled you grant the Governance app ZERO Microsoft
//  Graph directory permissions. Instead, in Entra you turn on
//  "Provisioning" for the enterprise app and point it at:
//
//      Tenant URL:  https://api.governance.birgma.com/scim/v2
//      Secret token: a long random bearer (store in Key Vault)
//
//  Entra then PUSHES only the users/groups ASSIGNED to the app to
//  these endpoints on its provisioning cycle (~40 min). The app
//  can never see anyone who isn't assigned, because it never reads
//  the directory at all.
//
//  This is a minimal, correct-enough implementation: Entra mostly
//  needs Users CRUD + a schema discovery surface. Harden before prod
//  (filtering, PATCH ops, pagination, ServiceProviderConfig).
// ============================================================
const express = require('express');
const crypto = require('crypto');
const { pool } = require('../src/db');

const router = express.Router();

// Bearer check — compare against the secret you configured in Entra.
const SCIM_TOKEN = process.env.SCIM_SECRET_TOKEN || '';
router.use((req, res, next) => {
  const tok = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!SCIM_TOKEN || tok.length !== SCIM_TOKEN.length ||
      !crypto.timingSafeEqual(Buffer.from(tok), Buffer.from(SCIM_TOKEN))) {
    return res.status(401).json({ detail: 'unauthorized' });
  }
  next();
});
router.use(express.json({ type: ['application/json', 'application/scim+json'] }));

const toScim = (e) => ({
  schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
  id: e.oid,
  userName: e.upn,
  active: e.status === 'Active',
  name: { formatted: e.display_name },
  displayName: e.display_name,
  title: e.job_title || undefined,
  emails: e.email ? [{ value: e.email, primary: true }] : [],
  // department drives policy assignment in our model
  'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User': { department: e.department },
});

// Create / provision a user
router.post('/Users', async (req, res) => {
  const b = req.body;
  const dept = b['urn:ietf:params:scim:schemas:extension:enterprise:2.0:User']?.department || 'Unassigned';
  const email = (b.emails && b.emails[0] && b.emails[0].value) || b.userName;
  const r = await pool.query(
    `insert into employees (oid, upn, email, display_name, job_title, department, source, status, synced_at)
     values (gen_random_uuid(), $1, $2, $3, $4, $5, 'Entra ID', $6, now())
     on conflict (upn) do update set display_name=excluded.display_name, department=excluded.department, synced_at=now()
     returning *`,
    [b.userName, email, b.displayName || b.name?.formatted || b.userName, b.title || null, dept,
     b.active === false ? 'Disabled' : 'Active']
  ).catch(async () => {
    // employees.upn isn't unique in the base schema; add a unique index if you use SCIM:
    //   create unique index on employees (upn);
    const ex = await pool.query('select * from employees where upn=$1', [b.userName]);
    return ex;
  });
  res.status(201).json(toScim(r.rows[0]));
});

// Get a user (Entra reconciles state with this)
router.get('/Users/:id', async (req, res) => {
  const r = await pool.query('select * from employees where oid=$1 or upn=$1', [req.params.id]);
  if (!r.rows[0]) return res.status(404).json({ detail: 'not found' });
  res.json(toScim(r.rows[0]));
});

// Deactivate / update (Entra sends PATCH for active=false on offboarding)
router.patch('/Users/:id', async (req, res) => {
  const ops = req.body.Operations || [];
  const active = ops.find((o) => (o.path || '').toLowerCase() === 'active');
  if (active) {
    await pool.query('update employees set status=$2, synced_at=now() where oid=$1',
      [req.params.id, active.value ? 'Active' : 'Disabled']);
  }
  const r = await pool.query('select * from employees where oid=$1', [req.params.id]);
  res.json(toScim(r.rows[0]));
});

module.exports = router;
