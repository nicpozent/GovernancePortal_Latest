// ============================================================
//  Diagnostics shared library: result helpers, a check runner, a
//  human/JSON reporter, and small utilities (timed fetch, a fail-fast
//  Postgres pool). Each subsystem file imports this and can run standalone.
// ============================================================
const { Pool } = require('pg');

const SYM = { pass: '✓', warn: '⚠', fail: '✗', skip: '∘', info: 'ℹ' };
const COL = { pass: 32, warn: 33, fail: 31, skip: 90, info: 36, bold: 1, dim: 2 };
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);

// Result constructors. `hint` is the actionable remediation shown to the user.
const result = (status, title, detail = '', hint = '') => ({ status, title, detail, hint });
const pass = (t, d) => result('pass', t, d);
const warn = (t, d, h) => result('warn', t, d, h);
const fail = (t, d, h) => result('fail', t, d, h);
const skip = (t, d, h) => result('skip', t, d, h);

// fetch with an abort timeout; never throws past the caller's try.
async function timedFetch(url, opts = {}, ms = 6000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  finally { clearTimeout(id); }
}

// A short-timeout pool for diagnostics so connectivity problems fail fast.
function diagPool(connectionString) {
  return new Pool({ connectionString, max: 1, connectionTimeoutMillis: 4000, statement_timeout: 5000, query_timeout: 5000, idle_timeout: 1000 });
}

// Run a group's checks; each check is { title, run: async () => result }.
// A thrown error becomes a fail with the message (so one check can't abort the rest).
async function runGroup(group) {
  const out = [];
  for (const chk of group.checks) {
    try {
      const r = await chk.run();
      out.push({ ...r, title: r.title || chk.title, group: group.id });
    } catch (e) {
      out.push({ ...fail(chk.title, e.message, 'Unexpected error while running this check.'), group: group.id });
    }
  }
  return out;
}

function printGroup(group, results) {
  process.stdout.write(`\n${paint(COL.bold, group.title)} ${paint(COL.dim, '(' + group.id + ')')}\n`);
  for (const r of results) {
    const tag = paint(COL[r.status] || 0, `${SYM[r.status] || '?'} ${r.status.toUpperCase().padEnd(4)}`);
    process.stdout.write(`  ${tag} ${r.title}${r.detail ? ' — ' + paint(COL.dim, r.detail) : ''}\n`);
    if (r.hint && (r.status === 'fail' || r.status === 'warn')) {
      process.stdout.write(`        ${paint(COL.dim, '→ ' + r.hint)}\n`);
    }
  }
}

// Print a summary and return an exit code: 0 all pass, 1 warnings only, 2 any fail.
function summarize(all) {
  const n = (s) => all.filter((r) => r.status === s).length;
  const fails = n('fail'), warns = n('warn');
  process.stdout.write(`\n${paint(COL.bold, 'Summary')}  `);
  process.stdout.write(`${paint(COL.pass, n('pass') + ' pass')}  ${paint(COL.warn, warns + ' warn')}  ${paint(COL.fail, fails + ' fail')}  ${paint(COL.skip, n('skip') + ' skip')}\n`);
  const verdict = fails ? paint(COL.fail, 'PROBLEMS FOUND — see ✗ above') : warns ? paint(COL.warn, 'OK with warnings') : paint(COL.pass, 'All clear');
  process.stdout.write(`${verdict}\n`);
  return fails ? 2 : warns ? 1 : 0;
}

// Standalone entry: `node <subsystem>.check.js [--json]`.
async function runStandalone(group) {
  const json = process.argv.includes('--json');
  const results = await runGroup(group);
  if (json) { process.stdout.write(JSON.stringify({ group: group.id, results }, null, 2) + '\n'); }
  else { printGroup(group, results); }
  process.exit(json ? (results.some((r) => r.status === 'fail') ? 2 : 0) : summarize(results));
}

module.exports = { result, pass, warn, fail, skip, timedFetch, diagPool, runGroup, printGroup, summarize, runStandalone, paint, COL };
