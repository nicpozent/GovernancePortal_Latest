// ============================================================
//  Shared rate-limit store (HA step 3).
//
//  express-rate-limit counts requests in EACH process's memory by default, so
//  with N API replicas a client effectively gets N× the limit and the counters
//  reset per instance. Setting RATE_LIMIT_REDIS_URL switches the limiters to a
//  Redis-backed store so the window is shared across every replica.
//
//  Opt-in and lazy: with no RATE_LIMIT_REDIS_URL, makeStore() returns undefined
//  and express-rate-limit uses its built-in in-memory store — today's
//  single-host behaviour is completely unchanged. 'rate-limit-redis' and 'redis'
//  are lazy-required, so they're only needed when the Redis URL is set.
//
//  Each limiter must get its OWN store instance (a store is stateful per
//  limiter — express-rate-limit calls store.init() with that limiter's window),
//  so makeStore(name) builds a fresh store with a distinct key prefix while
//  sharing a single Redis connection.
// ============================================================
const cfg = require('./config');
const { logger } = require('./logger');

let _client = null;   // shared redis connection
let _ready = null;    // resolves when connected
let _deps = null;     // { RedisStore }
let _init = false;

function ensureClient() {
  if (_init) return _client;
  _init = true;
  const url = cfg.rateLimit.redisUrl;
  if (!url) { _client = null; return null; }
  let RedisStore, createClient;
  try {
    ({ RedisStore } = require('rate-limit-redis'));
    ({ createClient } = require('redis'));
  } catch (e) {
    throw new Error(
      "RATE_LIMIT_REDIS_URL is set but 'rate-limit-redis'/'redis' are not installed (npm i rate-limit-redis redis)",
      { cause: e });
  }
  _deps = { RedisStore };
  _client = createClient({ url });
  _client.on('error', (err) => logger.error({ err: err.message }, 'rate-limit redis error'));
  // Connect once; sendCommand awaits this so early requests don't race the handshake.
  _ready = _client.connect()
    .then(() => logger.info('rate-limit: using shared Redis store'))
    .catch((err) => logger.error({ err: err.message }, 'rate-limit redis connect failed'));
  return _client;
}

// Build a store for a named limiter, or undefined (→ in-memory default).
function makeStore(name) {
  const client = ensureClient();
  if (!client) return undefined;
  return new _deps.RedisStore({
    sendCommand: async (...args) => { await _ready; return client.sendCommand(args); },
    prefix: `${cfg.rateLimit.prefix}${name}:`,
  });
}

module.exports = { makeStore };
