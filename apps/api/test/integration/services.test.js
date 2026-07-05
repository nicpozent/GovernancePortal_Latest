// Service-layer tests: directory sync, reminders, and SharePoint browsing —
// the previously-untested external-integration code. Microsoft Graph is stubbed
// (helpers/graph); the real SQL runs against the ephemeral Postgres.
const test = require('node:test');
const assert = require('node:assert/strict');

// Env must be set BEFORE anything loads src/config (via src/db / src/graph).
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://governance_app:apppw@127.0.0.1:55432/governance';
process.env.AZURE_TENANT_ID = process.env.AZURE_TENANT_ID || 'test-tenant';
process.env.API_CLIENT_ID = process.env.API_CLIENT_ID || 'test-api';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.GRAPH_ENTERPRISE_APP_SP_ID = process.env.GRAPH_ENTERPRISE_APP_SP_ID || '00000000-0000-4000-8000-0000000000ff';
process.env.SHAREPOINT_SITE_ID = process.env.SHAREPOINT_SITE_ID || 'site-123';
process.env.GRAPH_MAIL_SENDER = process.env.GRAPH_MAIL_SENDER || 'noreply@x';

const { installFakeGraph, setGraphHandlers } = require('../helpers/graph');
installFakeGraph();                       // must precede the service requires

const db = require('../helpers/db');
const { runSync } = require('../../src/services/sync');
const { runReminders } = require('../../src/services/reminders');
const sharepoint = require('../../src/services/sharepoint');
const { pool } = require('../../src/db');  // the services' own pool — close it at the end

let dbUp = false;
test.before(async () => { dbUp = await db.available(); if (dbUp) await db.applyAll(); });
test.beforeEach(async () => { if (dbUp) await db.truncate(); });
test.after(async () => { await db.end(); try { await pool.end(); } catch (_) {} });

const uuid = db.uuid;

test('runSync upserts assigned group members and directly-assigned users, records the run', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const gid = uuid(101);       // Entra group id
  const memberOid = uuid(102); // user in that group
  const directOid = uuid(103); // directly-assigned user
  setGraphHandlers({
    onGet: (path) => {
      if (path.includes('/appRoleAssignedTo')) return { value: [
        { principalType: 'Group', principalId: gid },
        { principalType: 'User', principalId: directOid },
      ] };
      if (path === `/groups/${gid}`) return { id: gid, displayName: 'Finance', description: 'Finance team' };
      if (path.includes(`/groups/${gid}/members`)) return { value: [
        { id: memberOid, displayName: 'Member One', userPrincipalName: 'm1@x', mail: 'm1@x', jobTitle: 'Analyst', department: 'Finance' },
      ] };
      if (path === `/users/${directOid}`) return { id: directOid, displayName: 'Direct User', userPrincipalName: 'd@x', mail: 'd@x' };
      return {};
    },
  });

  const out = await runSync();
  assert.equal(out.added, 2, 'one group member + one direct user');
  assert.equal(out.total, 2);
  // Users landed in the directory.
  assert.equal((await db.superPool.query('select count(*)::int n from employees where oid = any($1::uuid[])', [[memberOid, directOid]])).rows[0].n, 2);
  // Group + membership were created.
  const grp = (await db.superPool.query('select id from groups where entra_group_id=$1', [gid])).rows[0];
  assert.ok(grp, 'the assigned group was upserted');
  assert.equal((await db.superPool.query('select count(*)::int n from employee_groups where employee_oid=$1 and group_id=$2', [memberOid, grp.id])).rows[0].n, 1);
  // A successful sync run was recorded.
  const run = (await db.superPool.query("select status, added from sync_runs order by started_at desc limit 1")).rows[0];
  assert.equal(run.status, 'success');
});

test('runSync marks unseen Entra employees as leavers (never deletes)', async (t) => {
  if (!dbUp) return t.skip('no test database');
  // An existing Entra-sourced active employee who will NOT appear in this sync.
  const leaver = uuid(110);
  await db.superPool.query(
    `insert into employees (oid, upn, email, display_name, source, status) values ($1,'l@x','l@x','Leaver','Entra ID','Active')`, [leaver]);
  const stillHere = uuid(111);
  setGraphHandlers({
    onGet: (path) => {
      if (path.includes('/appRoleAssignedTo')) return { value: [{ principalType: 'User', principalId: stillHere }] };
      if (path === `/users/${stillHere}`) return { id: stillHere, displayName: 'Present', userPrincipalName: 'p@x', mail: 'p@x' };
      return {};
    },
  });

  const out = await runSync();
  assert.equal(out.deactivated, 1);
  const l = (await db.superPool.query('select status from employees where oid=$1', [leaver])).rows[0];
  assert.equal(l.status, 'Inactive', 'the leaver is retained but inactivated, not deleted');
});

test('runReminders emails the first milestone for an unsigned requirement and is idempotent', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const emp = await db.seedEmployee({ name: 'Reminder Target', email: 'target@x' });
  const grp = await db.seedGroup({ kind: 'Local' });
  await db.addMember(emp, grp);
  await db.seedPolicy({ name: 'Code of Conduct', version: 'v1', groupIds: [grp] }); // no due date → 'assigned'

  const sent = [];
  setGraphHandlers({ onPost: (path, body) => { if (path.includes('/sendMail')) sent.push(body.message.toRecipients[0].emailAddress.address); return {}; } });

  const out = await runReminders();
  assert.equal(out.sent, 1, 'one assignment reminder sent');
  assert.deepEqual(sent, ['target@x']);
  assert.equal((await db.superPool.query("select count(*)::int n from notifications_sent where user_oid=$1 and milestone='assigned'", [emp])).rows[0].n, 1);

  // Second run must NOT re-send the same milestone.
  const again = await runReminders();
  assert.equal(again.sent, 0, 'idempotent — no duplicate reminder');
});

test('runReminders is a safe no-op when the mail sender is not configured', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const saved = require('../../src/config').graph.mailSender;
  require('../../src/config').graph.mailSender = null;   // simulate unconfigured
  try {
    const out = await runReminders();
    assert.equal(out.disabled, true);
    assert.equal(out.sent, 0);
  } finally { require('../../src/config').graph.mailSender = saved; }
});

test('sharepoint.listLibraries maps drives to picker entries', async () => {
  setGraphHandlers({ onGet: (path) => {
    if (path === '/sites/site-123/drives') return { value: [
      { id: 'd2', name: 'Policies', webUrl: 'https://sp/d2' },
      { id: 'd1', name: 'Archive', webUrl: 'https://sp/d1' },
    ] };
    return {};
  } });
  const libs = await sharepoint.listLibraries();
  assert.equal(libs.length, 2);
  assert.equal(libs[0].name, 'Archive', 'sorted by name');
  assert.equal(libs[0].driveId, 'd1');
  assert.ok(libs[0].isLibrary && libs[0].isFolder);
});

test('sharepoint.listFolder returns folders first, then files', async () => {
  setGraphHandlers({ onGet: (path) => {
    if (path === '/drives/d1/root/children') return { value: [
      { id: 'i1', name: 'readme.pdf', file: {}, size: 10, webUrl: 'u1' },
      { id: 'i2', name: 'Approved', folder: { childCount: 3 }, webUrl: 'u2' },
    ] };
    return {};
  } });
  const { items } = await sharepoint.listFolder('d1', '');
  assert.equal(items[0].name, 'Approved', 'folder sorts before file');
  assert.equal(items[0].isFolder, true);
  assert.equal(items[1].name, 'readme.pdf');
  assert.equal(items[1].isFolder, false);
});
