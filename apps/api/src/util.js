// ============================================================
//  Small shared utilities (pure, dependency-free, unit-tested).
// ============================================================

// HTML-escape any value before interpolating it into outbound markup
// (emails). Prevents untrusted input (user-typed names, admin-set policy
// names) from injecting tags/attributes into the rendered message.
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Allow only http(s) outbound forward URLs, and reject loopback / link-local
// hosts (incl. the cloud metadata endpoint 169.254.169.254) to blunt SSRF via
// the admin-configured log-forward target. Private RFC-1918 ranges are NOT
// blocked: internal SIEM/webhook endpoints are a legitimate use on this network.
function isSafeHttpUrl(raw) {
  let u;
  try { u = new URL(String(raw)); } catch { return false; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  let host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');   // strip IPv6 brackets
  if (!host) return false;
  // Normalise an IPv4-mapped IPv6 address down to its embedded IPv4 so the v4
  // loopback/metadata rules below apply. Node stores ::ffff:127.0.0.1 in HEX
  // form (::ffff:7f00:1), so decode the two trailing hextets back to dotted IPv4;
  // otherwise ::ffff:127.0.0.1 / ::ffff:169.254.169.254 would slip past.
  const hexMapped = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMapped) {
    const hi = parseInt(hexMapped[1], 16), lo = parseInt(hexMapped[2], 16);
    host = `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
  } else {
    const dotMapped = host.match(/:ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (dotMapped) host = dotMapped[1];
  }
  if (host === 'localhost' || host.endsWith('.localhost')) return false;
  if (host === '127.0.0.1' || host.startsWith('127.')) return false;
  if (host === '0.0.0.0' || host === '::' || host === '::1') return false;
  if (host.startsWith('169.254.')) return false;          // IPv4 link-local + metadata
  if (host.startsWith('fe80:') || host.startsWith('fd') || host.startsWith('fc')) return false; // IPv6 link/unique-local
  return true;
}

// Derive libpq env vars from a connection string so secrets (password) are
// passed to child processes (pg_dump) via the environment, never as argv
// (which is world-readable in the process list).
function pgEnvFrom(databaseUrl, baseEnv) {
  const u = new URL(databaseUrl);
  return {
    ...(baseEnv || {}),
    PGHOST: u.hostname,
    PGPORT: u.port || '5432',
    PGUSER: decodeURIComponent(u.username || ''),
    PGPASSWORD: decodeURIComponent(u.password || ''),
    PGDATABASE: u.pathname.replace(/^\//, '') || 'postgres',
  };
}

// Decide which single reminder milestone (if any) applies today for a required,
// unsigned policy. Pure function — kept here so it's unit-testable without the
// Graph/DB dependencies that the reminders service pulls in.
function milestoneFor(daysToDue, assignedSent) {
  if (!assignedSent) return 'assigned';
  if (daysToDue == null) return null;            // no deadline → only the assigned mail
  if (daysToDue < 0) return 'overdue';
  if (daysToDue <= 1) return 'due-1';
  if (daysToDue <= 7) return 'due-7';
  if (daysToDue <= 15) return 'due-15';
  if (daysToDue <= 20) return 'due-20';
  return null;
}

module.exports = { escapeHtml, isSafeHttpUrl, pgEnvFrom, milestoneFor };
