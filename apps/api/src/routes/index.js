// ============================================================
//  API router — assembles the per-domain route modules. Every route
//  requires a valid Entra token (requireAuth) and gets the async-error
//  wrapper + UUID param validation applied here, once, to the shared router.
// ============================================================
const express = require('express');
const { requireAuth } = require('../auth');

const r = express.Router();

// Wrap async route handlers so a rejected promise becomes a clean 500
// (via the error handler) instead of an unhandledRejection that crashes
// the Node process. Middleware (3-arg, e.g. requireAdmin) is left as-is.
['get', 'post', 'put', 'delete', 'patch'].forEach((m) => {
  const orig = r[m].bind(r);
  r[m] = (path, ...handlers) =>
    orig(path, ...handlers.map((h) =>
      typeof h === 'function' && h.length < 3
        ? (req, res, next) => Promise.resolve(h(req, res, next)).catch(next)
        : h
    ));
});

r.use(requireAuth);

// Reject malformed UUID route params up front with a clean 400 instead of
// letting a Postgres cast error surface as a generic 500.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidParam = (req, res, next, value) =>
  UUID_RE.test(value) ? next() : res.status(400).json({ error: 'bad_id' });
['id', 'oid', 'adId', 'pgId'].forEach((p) => r.param(p, uuidParam));

// Mount the domain modules onto the shared (wrapped) router.
require('./me')(r);
require('./policies')(r);
require('./signatures')(r);
require('./employees')(r);
require('./manager')(r);
require('./trainings')(r);
require('./quizzes')(r);
require('./groups')(r);
require('./admin')(r);
require('./dashboards')(r);
require('./approvals')(r);
require('./approval-templates')(r);

module.exports = r;
