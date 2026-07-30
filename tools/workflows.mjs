// Do the workflow files actually parse?
//
// A gate that exists because of a specific wasted round-trip. `relay.yml` had an
// inline script whose lines started at column 0 inside a YAML block scalar,
// which silently ends the block. GitHub accepted the push, created a run,
// and failed it in under a second with **zero jobs** — so the run reported
// `failure`, the logs endpoint reported "no failed jobs found", and the only way
// to see the cause was to parse the file locally.
//
// That is the worst diagnostic shape there is: red, with nothing to read. It cost
// two runs to notice. Parsing every workflow takes milliseconds, so it happens
// here instead.
//
// This cannot check semantics — a valid file can still be wrong — only that the
// file is YAML at all and has the keys a workflow must have. That is exactly the
// class of failure it is for.
//
//   node tools/workflows.mjs

import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '.github', 'workflows');
const failures = [];

for (const name of readdirSync(DIR).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))) {
  const path = join(DIR, name);
  try {
    // PyYAML rather than a dependency: it is on every GitHub runner and on this
    // machine, and adding a node YAML parser to devDependencies to check three
    // files would be a worse trade.
    const out = execFileSync('python3', ['-c', `
import yaml, sys
d = yaml.safe_load(open(sys.argv[1]))
if not isinstance(d, dict): raise SystemExit('not a mapping')
# "on" is the YAML 1.1 boolean True once parsed, which is itself a trap worth
# naming: a workflow whose trigger block vanished would still look fine here.
trigger = d.get('on', d.get(True))
if trigger is None: raise SystemExit('no trigger block')
if not d.get('jobs'): raise SystemExit('no jobs')
print(len(d['jobs']))
`, path], { encoding: 'utf8' }).trim();
    console.log(`  ok    ${name} parses, ${out} job(s)`);
  } catch (err) {
    const why = (err.stderr || err.stdout || String(err)).trim().split('\n').slice(-3).join(' ');
    failures.push(name);
    console.error(`  FAIL  ${name} — ${why}`);
  }
}

console.log('');
if (failures.length) {
  console.error(`${failures.length} workflow file(s) would fail before running a single step.`);
  process.exit(1);
}
console.log('Every workflow file parses and has a trigger and jobs.');
