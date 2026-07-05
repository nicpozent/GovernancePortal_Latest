#!/usr/bin/env node
// ============================================================
//  Privileged GDPR CLI — data-subject export, erasure, and retention purge.
//
//  Erasure and retention DELETE rows from the append-only ledgers, which the
//  least-privilege app role (governance_app) is REVOKE'd from doing. So this
//  tool connects as an ADMIN/superuser (ADMIN_DATABASE_URL) — the same
//  connection the migration runner uses — and is run by a DBA, never by the app.
//
//  SAFETY: erase/retention are DRY-RUN by default. They print exactly what would
//  change and touch nothing until you pass --apply. Every real run should be
//  recorded in the DSAR/erasure register (see docs/GDPR-DATA-RIGHTS.md).
//
//  Usage (from apps/api):
//    ADMIN_DATABASE_URL=postgres://postgres:***@host:5432/governance \
//      node db/gdpr.js export   --oid <oid>            # print the subject's data (JSON)
//      node db/gdpr.js erase    --oid <oid>            # DRY-RUN: show what erasure would remove
//      node db/gdpr.js erase    --oid <oid> --apply    # perform the erasure
//      node db/gdpr.js retention                        # DRY-RUN: count records past retention
//      node db/gdpr.js retention --years 7 --apply      # purge records older than 7 years
// ============================================================
const { Client } = require('pg');
const { collectSubject, eraseSubject, purgeRetention } = require('../src/gdpr');

const CONN = process.env.ADMIN_DATABASE_URL || process.env.DATABASE_URL;
const args = process.argv.slice(2);
const cmd = args[0];
const apply = args.includes('--apply');
const getOpt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const RETENTION_YEARS = parseInt(process.env.RETENTION_YEARS, 10) || 10;

function usage() {
  console.error('Usage: node db/gdpr.js <export|erase|retention> [--oid <oid>] [--years N] [--apply]');
  process.exit(2);
}

async function main() {
  if (!CONN) { console.error('Set ADMIN_DATABASE_URL (a superuser/owner connection).'); process.exit(2); }
  if (!['export', 'erase', 'retention'].includes(cmd)) usage();
  const c = new Client({ connectionString: CONN });
  await c.connect();
  try {
    if (cmd === 'export') {
      const oid = getOpt('--oid'); if (!oid) usage();
      const pkg = await collectSubject(c, oid);
      if (!pkg.found) { console.error(`No data subject with oid ${oid}.`); process.exit(1); }
      process.stdout.write(JSON.stringify(pkg, null, 2) + '\n');

    } else if (cmd === 'erase') {
      const oid = getOpt('--oid'); if (!oid) usage();
      // Dry-run first: show the counts the export reports, so the operator sees
      // exactly what will be removed before applying.
      const before = await collectSubject(c, oid);
      if (!before.found) { console.error(`No data subject with oid ${oid}.`); process.exit(1); }
      console.log(`Subject ${oid} (${before.employee.display_name || '?'}) holds:`, JSON.stringify(before.counts));
      if (!apply) {
        console.log('DRY-RUN. Re-run with --apply to erase (personal records deleted; audit entries pseudonymised).');
        return;
      }
      const removed = await eraseSubject(c, oid);
      console.log('ERASED:', JSON.stringify(removed));

    } else if (cmd === 'retention') {
      const years = parseInt(getOpt('--years'), 10) || RETENTION_YEARS;
      const cutoff = new Date(); cutoff.setUTCFullYear(cutoff.getUTCFullYear() - years);
      // Count what is past retention without deleting.
      const counts = {};
      for (const [k, sql] of [
        ['signatures', 'select count(*)::int n from signatures where signed_at < $1'],
        ['quizAttempts', 'select count(*)::int n from quiz_attempts where at < $1'],
        ['notifications', 'select count(*)::int n from notifications_sent where sent_at < $1'],
        ['auditLog', 'select count(*)::int n from audit_log where at < $1'],
      ]) counts[k] = (await c.query(sql, [cutoff.toISOString()])).rows[0].n;
      console.log(`Records older than ${years}y (before ${cutoff.toISOString().slice(0, 10)}):`, JSON.stringify(counts));
      if (!apply) { console.log('DRY-RUN. Re-run with --apply to purge them.'); return; }
      const removed = await purgeRetention(c, cutoff);
      console.log('PURGED:', JSON.stringify(removed));
    }
  } finally {
    await c.end();
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
