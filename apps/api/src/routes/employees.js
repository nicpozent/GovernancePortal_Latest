// Generated from the former monolithic routes.js — handler bodies are verbatim.
const { pool } = require('../db');
const { requireAdmin } = require('../auth');
const { audit } = require('../authz');

module.exports = (r) => {
// ── employees (admin) ────────────────────────────────────────
r.get('/employees', requireAdmin, async (_req, res) => {
  res.json((await pool.query(
    `select e.*, fm.display_name as functional_manager_name
       from employees e
       left join employees fm on fm.oid = e.functional_manager_oid
      order by e.department, e.display_name`)).rows);
});

// set / clear the functional (real) manager (admin)
r.put('/employees/:oid/manager', requireAdmin, async (req, res) => {
  const { functionalManagerOid } = req.body || {};
  await pool.query('update employees set functional_manager_oid = $2 where oid = $1',
    [req.params.oid, functionalManagerOid || null]);
  await audit(req, 'employee.manager.set', req.params.oid, { functionalManagerOid: functionalManagerOid || null });
  res.status(204).end();
});

// bulk-import local users from CSV rows (admin) — optional; AD sync still primary
r.post('/employees/bulk', requireAdmin, async (req, res) => {
  const rows = Array.isArray(req.body && req.body.rows) ? req.body.rows : [];
  if (!rows.length) return res.status(400).json({ error: 'no_rows' });
  let added = 0, skipped = 0;
  for (const row of rows) {
    const first = (row.firstName || '').trim(), last = (row.lastName || '').trim();
    const display = (row.displayName || `${first} ${last}`).trim();
    const email = (row.email || '').trim();
    if (!display && !email) { skipped++; continue; }
    try {
      await pool.query(
        `insert into employees (oid, upn, email, display_name, job_title, department, source, synced_at)
         values (gen_random_uuid(), $1, $1, $2, $3, $4, 'Local', now())`,
        [email || 'user@birgma.com', display || email, (row.jobTitle || '').trim() || null, (row.department || '').trim() || 'Unassigned']
      );
      added++;
    } catch (e) { skipped++; }
  }
  await audit(req, 'employee.bulk_import', null, { added, skipped });
  res.json({ added, skipped });
});

// add a LOCAL user (admin) — source = 'Local'
r.post('/employees', requireAdmin, async (req, res) => {
  const { firstName, lastName, email, department, jobTitle } = req.body || {};
  const display = `${firstName || ''} ${lastName || ''}`.trim() || 'New User';
  const ins = await pool.query(
    `insert into employees (oid, upn, email, display_name, job_title, department, source, synced_at)
     values (gen_random_uuid(), $1, $1, $2, $3, $4, 'Local', now()) returning *`,
    [email || 'user@birgma.com', display, jobTitle || null, department || 'Unassigned']
  );
  await audit(req, 'employee.create.local', display, { email });
  res.status(201).json(ins.rows[0]);
});

// ── former employees (leavers) — signatures retained (admin) ─
r.get('/employees/former', requireAdmin, async (_req, res) => {
  res.json((await pool.query(
    `select e.oid, e.display_name, e.email, e.upn, e.department, e.status, e.deactivated_at, e.synced_at,
            (select count(*) from signatures s where s.user_oid = e.oid)::int as signatures
       from employees e
      where e.status <> 'Active'
      order by e.deactivated_at desc nulls last, e.display_name`)).rows);
});
};
