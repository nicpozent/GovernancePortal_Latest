// Subsystem: the API process itself (run from where you can reach it; inside the
// api container the default http://127.0.0.1:8080 is cert-free).
// Override with DIAG_API_URL. Run: node tools/diagnostics/api.check.js
const { pass, warn, fail, timedFetch, runStandalone } = require('./lib');

const BASE = process.env.DIAG_API_URL || 'http://127.0.0.1:8080';

const group = {
  id: 'api',
  title: `API process (${BASE})`,
  checks: [
    { title: 'Liveness probe /healthz returns ok', run: async () => {
      try {
        const res = await timedFetch(`${BASE}/healthz`, {}, 5000);
        if (!res.ok) return fail('Liveness /healthz', `HTTP ${res.status}`, 'API is up but unhealthy — check `docker compose logs api`.');
        const b = await res.json().catch(() => ({}));
        return b.ok === true ? pass('Liveness /healthz', 'ok:true') : warn('Liveness /healthz', 'unexpected body', 'Healthz responded without {ok:true}.');
      } catch (e) { return fail('Liveness /healthz', e.message, `API not reachable at ${BASE}. Is the container running and the port mapped? Try DIAG_API_URL.`); }
    } },
    { title: 'Auth is enforced (unauthenticated /api/me is rejected)', run: async () => {
      try {
        const res = await timedFetch(`${BASE}/api/me`, {}, 5000);
        if (res.status === 401) return pass('Auth enforced on /api', '401 without a token');
        if (res.status === 404) return warn('Auth enforced on /api', '404 — routes not mounted?', 'Expected 401. Is the /api router mounted? Check startup logs.');
        return fail('Auth enforced on /api', `got HTTP ${res.status} without a token`, 'Endpoints must reject anonymous calls with 401 — verify requireAuth is applied.');
      } catch (e) { return fail('Auth enforced on /api', e.message, `Could not reach ${BASE}/api/me.`); }
    } },
    { title: 'Correlation id header is emitted', run: async () => {
      try {
        const res = await timedFetch(`${BASE}/healthz`, {}, 5000);
        return res.headers.get('x-request-id') ? pass('Correlation id header', 'x-request-id present') : warn('Correlation id header', 'x-request-id missing', 'Request logging may not be wired; errors will be harder to trace.');
      } catch (e) { return warn('Correlation id header', e.message); }
    } },
  ],
};

module.exports = group;
if (require.main === module) runStandalone(group);
