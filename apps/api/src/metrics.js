// ============================================================
//  Prometheus metrics (RED: Rate, Errors, Duration) + Node runtime metrics.
//
//  Exposed at GET /metrics (see app.js). No PII — only request counts/latencies
//  labelled by method, normalised route, and status. Restrict scrape access at
//  the edge (nginx/Front Door) to your monitoring network; the endpoint itself
//  is intentionally unauthenticated so a Prometheus/Azure Monitor agent can poll
//  it without an Entra token, exactly like /healthz.
// ============================================================
const client = require('prom-client');

const register = new client.Registry();
register.setDefaultLabels({ app: 'governance-api' });
// Node process/GC/event-loop/heap metrics.
client.collectDefaultMetrics({ register });

// The RED signals for HTTP traffic.
const httpDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency in seconds',
  labelNames: ['method', 'route', 'status'],
  // Buckets tuned for a JSON API (1ms … 5s).
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});
const httpTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

// Route label = the matched Express route pattern (e.g. /api/policies/:id/file),
// NOT the raw URL — so high-cardinality ids don't explode the label space. Falls
// back to the mount path, then 'unmatched'.
function routeLabel(req) {
  if (req.route && req.route.path) {
    const base = req.baseUrl || '';
    return base + (req.route.path === '/' ? '' : req.route.path);
  }
  return req.baseUrl || 'unmatched';
}

// Express middleware: time every request and record it on finish.
function metricsMiddleware(req, res, next) {
  if (req.path === '/metrics') return next();   // don't measure the scrape itself
  const end = httpDuration.startTimer();
  res.on('finish', () => {
    const labels = { method: req.method, route: routeLabel(req), status: String(res.statusCode) };
    end(labels);
    httpTotal.inc(labels);
  });
  next();
}

module.exports = { register, metricsMiddleware };
