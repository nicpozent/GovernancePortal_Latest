// Unit test for the shared rate-limit store factory. With no RATE_LIMIT_REDIS_URL
// (the default), makeStore() must return undefined so express-rate-limit falls
// back to its in-memory store — i.e. single-host behaviour is unchanged and no
// redis dependency is pulled in. Run: `npm test` (no DB, no redis).
const test = require('node:test');
const assert = require('node:assert/strict');

// Ensure the env is clean before config/ratelimit are required.
delete process.env.RATE_LIMIT_REDIS_URL;
const { makeStore } = require('../../src/ratelimit');

test('makeStore returns undefined (in-memory default) when no Redis URL is set', () => {
  assert.equal(makeStore('api'), undefined);
  assert.equal(makeStore('sync'), undefined);
  assert.equal(makeStore('feed'), undefined);
});
