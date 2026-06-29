// Integration tests at the DATABASE layer — run against a real Postgres.
// Validate the two invariants the application relies on:
//   1. effective_group_membership reproduces direct ∪ mapped membership
//      (the consolidation behind finding M-1), excluding archived groups.
//   2. The append-only ledgers physically reject UPDATE/DELETE for the app role.
// Skips cleanly when no test database is reachable (see helpers/db.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../helpers/db');

let dbUp = false;
test.before(async () => { dbUp = await db.available(); if (dbUp) await db.applyAll(); });
test.beforeEach(async () => { if (dbUp) await db.truncate(); });
test.after(async () => { await db.end(); });

test('effective_group_membership: direct local-group membership', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const emp = await db.seedEmployee({});
  const grp = await db.seedGroup({ kind: 'Local' });
  await db.addMember(emp, grp);
  const rows = (await db.superPool.query(
    'select group_id, employee_oid from effective_group_membership where group_id=$1', [grp])).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].employee_oid, emp);
});

test('effective_group_membership: directory group mapped into a platform group rolls up', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const emp = await db.seedEmployee({});
  const adGroup = await db.seedGroup({ kind: 'Directory', source: 'Entra ID' });
  const platform = await db.seedGroup({ kind: 'Platform' });
  await db.addMember(emp, adGroup);     // member of the directory group
  await db.mapGroup(adGroup, platform); // directory group mapped into the platform group
  const rows = (await db.superPool.query(
    'select 1 from effective_group_membership where group_id=$1 and employee_oid=$2', [platform, emp])).rows;
  assert.equal(rows.length, 1, 'member should be effective in the platform group via the mapping');
});

test('effective_group_membership: archived groups are excluded', async (t) => {
  if (!dbUp) return t.skip('no test database');
  const emp = await db.seedEmployee({});
  const grp = await db.seedGroup({ kind: 'Local' });
  await db.addMember(emp, grp);
  await db.superPool.query('update groups set archived_at = now() where id=$1', [grp]);
  const rows = (await db.superPool.query(
    'select 1 from effective_group_membership where group_id=$1', [grp])).rows;
  assert.equal(rows.length, 0);
});

for (const tbl of ['signatures', 'audit_log', 'quiz_attempts']) {
  test(`append-only: app role can INSERT but not UPDATE/DELETE ${tbl}`, async (t) => {
    if (!dbUp) return t.skip('no test database');
    if (tbl === 'audit_log') {
      await db.appPool.query(`insert into audit_log (action) values ('t')`);
    } else if (tbl === 'signatures') {
      const emp = await db.seedEmployee({});
      const pol = await db.seedPolicy({ version: 'v1' });
      await db.appPool.query(
        `insert into signatures (policy_id, policy_version, user_oid, full_name) values ($1,'v1',$2,'N')`, [pol, emp]);
    } else {
      const emp = await db.seedEmployee({});
      const pol = await db.seedPolicy({});
      const { quizId } = await db.seedQuiz(pol, {});
      await db.appPool.query(
        `insert into quiz_attempts (quiz_id, policy_id, user_oid, attempt_no, score, max_score, pct, passed, answers)
         values ($1,$2,$3,1,1,1,100,true,'{}')`, [quizId, pol, emp]);
    }
    await assert.rejects(() => db.appPool.query(`update ${tbl} set ${tbl === 'audit_log' ? 'action' : 'user_oid'} = null`),
      /permission denied/i, 'UPDATE must be denied for the app role');
    await assert.rejects(() => db.appPool.query(`delete from ${tbl}`),
      /permission denied/i, 'DELETE must be denied for the app role');
  });
}
