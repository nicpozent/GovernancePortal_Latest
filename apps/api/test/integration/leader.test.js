// Integration test for the scheduler leader-lock (HA step 2). Verifies the
// Postgres advisory lock actually serializes leadership: while one session
// holds the lock, withLeaderLock() skips (returns false and does NOT run the
// job); once released it runs. This is what prevents duplicate backups/emails
// when the API is scaled to more than one instance.
const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../helpers/db');
const h = require('../helpers/app');           // sets env + builds the app (loads src/db pool)
const leader = require('../../src/leader');

let dbUp = false;
test.before(async () => { dbUp = await db.available(); });
test.after(async () => { await db.end(); try { await h.pool.end(); } catch (_) {} });

test('withLeaderLock runs the job when the lock is free', async (t) => {
  if (!dbUp) return t.skip('no test database');
  let ran = 0;
  const got = await leader.withLeaderLock('daily', async () => { ran++; });
  assert.equal(got, true, 'should acquire the free lock');
  assert.equal(ran, 1, 'job body should run exactly once');
  // Lock must be released afterwards — a second call still succeeds.
  const again = await leader.withLeaderLock('daily', async () => { ran++; });
  assert.equal(again, true);
  assert.equal(ran, 2);
});

test('withLeaderLock skips when another session holds the lock', async (t) => {
  if (!dbUp) return t.skip('no test database');
  // Simulate a second replica holding the lock on its own session.
  const holder = await h.pool.connect();
  await holder.query('select pg_advisory_lock($1)', [leader.LOCK_KEYS.backup]);
  try {
    let ran = false;
    const got = await leader.withLeaderLock('backup', async () => { ran = true; });
    assert.equal(got, false, 'must not become leader while the lock is held');
    assert.equal(ran, false, 'the job body must NOT run on a non-leader');
  } finally {
    await holder.query('select pg_advisory_unlock($1)', [leader.LOCK_KEYS.backup]);
    holder.release();
  }
  // Once the other holder releases, this instance can take over.
  let ranNow = false;
  const got2 = await leader.withLeaderLock('backup', async () => { ranNow = true; });
  assert.equal(got2, true, 'leadership should be acquirable after release');
  assert.equal(ranNow, true);
});

test('the lock is released even if the job throws', async (t) => {
  if (!dbUp) return t.skip('no test database');
  await assert.rejects(
    leader.withLeaderLock('daily', async () => { throw new Error('boom'); }),
    /boom/);
  // If the finally didn't release, this would hang/skip — it should acquire.
  let ran = false;
  const got = await leader.withLeaderLock('daily', async () => { ran = true; });
  assert.equal(got, true, 'lock must be freed after a throwing job');
  assert.equal(ran, true);
});

test('unknown lock name is rejected', async () => {
  await assert.rejects(leader.withLeaderLock('nope', async () => {}), /unknown leader lock/);
});
