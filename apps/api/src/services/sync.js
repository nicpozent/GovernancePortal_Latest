// ============================================================
//  Directory synchronization — LEAST PRIVILEGE
//
//  We never enumerate the whole tenant. We only read principals
//  that have been explicitly ASSIGNED to the Governance app
//  (enterprise app -> "User assignment required = Yes").
//
//  Graph permissions needed for this strategy (all application,
//  admin-consented):
//     Application.Read.All   -> read /servicePrincipals/{id}/appRoleAssignedTo
//     GroupMember.Read.All   -> expand members of the assigned groups
//     User.Read.All          -> read the 5 selected attributes per user
//
//  To go FURTHER (true confinement), put the in-scope people in an
//  Administrative Unit and assign this app a custom directory role
//  scoped to that AU — then User/GroupMember reads are physically
//  limited to the AU. See IMPLEMENTATION_GUIDE.md §2. For the
//  zero-permission option, see scim/scim.routes.js (Entra pushes
//  only assigned users to us; no Graph read at all).
// ============================================================
const graph = require('../graph');
const { pool } = require('../db');
const cfg = require('../config');

const SELECT = 'id,displayName,userPrincipalName,mail,jobTitle,department';

function nextPath(page) {
  const link = page['@odata.nextLink'];
  return link ? link.split('graph.microsoft.com/v1.0')[1] : null;
}

async function upsertGroup(g) {
  const r = await pool.query(
    `insert into groups (entra_group_id, name, description, source)
     values ($1, $2, $3, 'Entra ID')
     on conflict (entra_group_id) do update set
       name = excluded.name, description = excluded.description
     returning id`,
    [g.id, g.displayName, g.description || null]
  );
  return r.rows[0].id;
}

async function addMembership(userOid, groupId) {
  await pool.query(
    `insert into employee_groups (employee_oid, group_id) values ($1, $2) on conflict do nothing`,
    [userOid, groupId]
  );
}

async function upsertUser(u, department) {
  const mgr = u.manager || null;
  const r = await pool.query(
    `insert into employees (oid, upn, email, display_name, job_title, department, manager_name, manager_email, source, synced_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,'Entra ID', now())
     on conflict (oid) do update set
       upn          = excluded.upn,
       email        = excluded.email,
       display_name = excluded.display_name,
       job_title    = excluded.job_title,
       department   = excluded.department,
       manager_name = excluded.manager_name,
       manager_email= excluded.manager_email,
       synced_at    = now()
     returning (xmax = 0) as inserted`,
    [u.id, u.userPrincipalName, u.mail || null, u.displayName, u.jobTitle || null, department || 'Unassigned',
     mgr && mgr.displayName || null, mgr && mgr.mail || null]
  );
  return r.rows[0].inserted;
}

async function runSync() {
  const run = await pool.query(
    `insert into sync_runs (source, status) values ('Entra ID','running') returning id`
  );
  const runId = run.rows[0].id;
  let added = 0, updated = 0;
  const seen = new Set();

  try {
    // 1) Everything assigned to the Governance enterprise app.
    const directUserIds = new Set();
    const groupIds = new Set();
    let path = `/servicePrincipals/${cfg.graph.enterpriseAppSpId}/appRoleAssignedTo?$top=999`;
    while (path) {
      const page = await graph.api(path).get();
      for (const a of page.value) {
        if (a.principalType === 'User') directUserIds.add(a.principalId);
        else if (a.principalType === 'Group') groupIds.add(a.principalId);
      }
      path = nextPath(page);
    }

    // 2) Expand ONLY the assigned groups -> members.
    //    Each assigned Entra group becomes a first-class `groups` row, and
    //    every membership becomes an `employee_groups` row (many-to-many),
    //    so a person can belong to several groups at once.
    for (const gid of groupIds) {
      const g = await graph.api(`/groups/${gid}`).select('id,displayName,description').get();
      const groupRowId = await upsertGroup(g);
      let mpath = `/groups/${gid}/members/microsoft.graph.user?$select=${SELECT}&$expand=manager($select=displayName,mail)&$top=999`;
      while (mpath) {
        const page = await graph.api(mpath).get();
        for (const u of page.value) {
          if (u['@odata.type'] && !u['@odata.type'].toLowerCase().endsWith('user')) continue;
          const ins = await upsertUser(u, u.department || g.displayName);
          await addMembership(u.id, groupRowId);          // record membership regardless of dedup
          if (!seen.has(u.id)) { seen.add(u.id); ins ? added++ : updated++; }
        }
        mpath = nextPath(page);
      }
    }

    // 3) Directly-assigned users (minimal $select).
    for (const oid of directUserIds) {
      if (seen.has(oid)) continue;
      seen.add(oid);
      const u = await graph.api(`/users/${oid}`).select(SELECT).expand('manager($select=displayName,mail)').get();
      const ins = await upsertUser(u, u.department);
      ins ? added++ : updated++;
    }

    // 4) Leavers: any Entra-sourced employee NOT seen in this run is now
    //    inactive. We never delete — signatures and history are retained;
    //    they simply drop out of "required" and move to Former employees.
    let deactivated = 0;
    if (seen.size > 0) {
      const oids = Array.from(seen);
      const r = await pool.query(
        `update employees set status = 'Inactive', deactivated_at = now()
          where source in ('Entra ID','Active Directory')
            and status = 'Active'
            and oid <> all($1::uuid[])
          returning oid`, [oids]);
      deactivated = r.rowCount;
    }

    await pool.query(
      `update sync_runs set finished_at = now(), status = 'success', added = $2, updated = $3 where id = $1`,
      [runId, added, updated]
    );
    return { added, updated, deactivated, total: seen.size };
  } catch (e) {
    await pool.query(
      `update sync_runs set finished_at = now(), status = 'error', error = $2 where id = $1`,
      [runId, e.message]
    );
    throw e;
  }
}

module.exports = { runSync };
