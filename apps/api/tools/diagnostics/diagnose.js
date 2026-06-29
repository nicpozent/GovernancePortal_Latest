#!/usr/bin/env node
// ============================================================
//  Governance Portal diagnostics — run all subsystem checks, or a subset,
//  and report where a problem is (with a remediation hint per finding).
//
//    node tools/diagnostics/diagnose.js              # everything
//    node tools/diagnostics/diagnose.js db api       # just these subsystems
//    node tools/diagnostics/diagnose.js --json        # machine-readable
//    node tools/diagnostics/diagnose.js --list        # list subsystems
//    node tools/diagnostics/diagnose.js graph --deep  # include authenticated Graph call
//
//  Run inside the api container for db/api/identity/graph/backups/integration;
//  run in the web container (or host) for the `web` subsystem.
//  Exit code: 0 all pass · 1 warnings only · 2 any failure.
// ============================================================
const { runGroup, printGroup, summarize, paint, COL } = require('./lib');

// Each entry returns { group } or { pool, group } (DB-backed groups expose a pool to close).
const REGISTRY = {
  config: () => ({ group: require('./config.check') }),
  db: () => require('./db.check').build(),
  identity: () => ({ group: require('./identity.check') }),
  api: () => ({ group: require('./api.check') }),
  graph: () => ({ group: require('./graph.check') }),
  integration: () => require('./integration.check').build(),
  backups: () => ({ group: require('./backups.check') }),
  web: () => ({ group: require('./web.check') }),
};
const ORDER = ['config', 'db', 'identity', 'api', 'graph', 'integration', 'backups', 'web'];

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const list = args.includes('--list');
  const selected = args.filter((a) => !a.startsWith('--'));

  if (list) {
    process.stdout.write('Subsystems:\n' + ORDER.map((g) => '  - ' + g).join('\n') + '\n');
    return process.exit(0);
  }

  let groups = selected.length && !selected.includes('all') ? selected : ORDER;
  const unknown = groups.filter((g) => !REGISTRY[g]);
  if (unknown.length) {
    process.stderr.write(`Unknown subsystem(s): ${unknown.join(', ')}\nValid: ${ORDER.join(', ')}\n`);
    return process.exit(2);
  }

  if (!json) {
    process.stdout.write(paint(COL.bold, 'Birgma Governance Portal — diagnostics\n'));
    process.stdout.write(paint(COL.dim, `Checking: ${groups.join(', ')}\n`));
  }

  const all = [];
  const byGroup = {};
  const pools = [];
  for (const id of groups) {
    let group;
    try {
      const built = REGISTRY[id]();
      const resolved = built && typeof built.then === 'function' ? await built : built;
      group = resolved.group;
      if (resolved.pool) pools.push(resolved.pool);
    } catch (e) {
      // A group that can't even be constructed (e.g. config import threw) is itself a finding.
      const r = [{ status: 'fail', title: `${id} subsystem`, detail: e.message, hint: 'This subsystem could not initialize — often a config/env problem.', group: id }];
      byGroup[id] = r; all.push(...r);
      if (!json) printGroup({ id, title: id }, r);
      continue;
    }
    const results = await runGroup(group);
    byGroup[id] = results;
    all.push(...results);
    if (!json) printGroup(group, results);
  }

  await Promise.allSettled(pools.map((p) => p.end()));

  if (json) {
    process.stdout.write(JSON.stringify({ checkedAt: new Date().toISOString(), groups: byGroup }, null, 2) + '\n');
    process.exit(all.some((r) => r.status === 'fail') ? 2 : all.some((r) => r.status === 'warn') ? 1 : 0);
  }
  process.exit(summarize(all));
}

main();
