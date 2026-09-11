// ============================================================
//  Structured logging (pino) + outbound event forwarding.
//  - JSON logs with levels + timestamps to stdout (SIEM-friendly).
//  - Sensitive fields redacted.
//  - forwardEvent() ships business/audit events to an admin-configured
//    external API (webhook), fire-and-forget, batched per call.
// ============================================================
const pino = require('pino');
const { isSafeHttpUrl } = require('./util');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: [
      'req.headers.authorization', 'req.headers.cookie',
      'token', '*.token', 'password', '*.password',
      'clientSecret', '*.clientSecret', 'AZURE_CLIENT_SECRET',
    ],
    censor: '[redacted]',
  },
  formatters: { level: (label) => ({ level: label }) },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: { app: 'governance-api' },
});

// Forward a single structured event to an external consumer if configured.
// cfgRow = { forward_url, forward_token, forward_enabled } from integration_config.
async function forwardEvent(cfgRow, event) {
  if (!cfgRow || !cfgRow.forward_enabled || !cfgRow.forward_url) return { skipped: true };
  // Defense in depth: never forward to loopback/link-local (SSRF). The URL is
  // also validated when an admin saves it, but re-check here at send time.
  if (!isSafeHttpUrl(cfgRow.forward_url)) {
    logger.warn({ url: cfgRow.forward_url }, 'log-forward blocked: unsafe url');
    return { ok: false, error: 'unsafe_url' };
  }
  const headers = { 'content-type': 'application/json' };
  if (cfgRow.forward_token) headers['authorization'] = 'Bearer ' + cfgRow.forward_token;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(cfgRow.forward_url, {
      method: 'POST', headers, body: JSON.stringify(event), signal: ctrl.signal,
      // Never follow a redirect — a permitted host could 302 to an internal
      // target (SSRF). A 3xx is treated as a failed delivery instead.
      redirect: 'manual',
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    logger.warn({ err: e.message, url: cfgRow.forward_url }, 'log-forward failed');
    return { ok: false, error: e.message };
  } finally { clearTimeout(t); }
}

module.exports = { logger, forwardEvent };
