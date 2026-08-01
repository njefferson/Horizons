// The write-gate-bypass gate (build-plan §5 check 5).
//
// *"Nothing outside the gate imports the store's write API."* Claimed since
// the build plan was written, checked by nothing — while the app grew four
// raw-write call sites, every one of them legitimate and none of them
// verifiable without reading the whole tree.
//
// The invariant is law 1's second half. `admit()` is what refuses a write that
// would leave a node with no surface, no clock, no Menu placement and no
// clocked parent; a module that reaches `store.append` directly has stepped
// around it. The point is NOT that raw writes are forbidden — a handful are
// correct and reasoned — but that each one is a DECISION, and a decision
// nobody records is a decision that gets copied.
//
// So: an allowlist with a reason per entry. Adding a raw write means adding
// yourself here, in the same commit, with the argument written down.
//
//   node tools/write-gate.mjs
//   node tools/write-gate.mjs --break   deliberate-failure proof
//
// Exits non-zero on any unlisted bypass.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');

const failures = [];
const fail = (m) => { failures.push(m); console.error(`  FAIL  ${m}`); };
const pass = (m) => console.log(`  ok    ${m}`);

/** The store's write surface. Reads are unrestricted; these four change it. */
const WRITE_API = ['append', 'replaceAll', 'reset', 'putSnapshot'];

/**
 * Who may write without going through `admit`, and WHY. Every entry is an
 * argument, not a permission — if the reason stops being true, the entry goes.
 */
const ALLOWED = new Map([
  ['src/ui/session.ts',
    'THE gate path itself: session.commit calls admit() and appends what it returns.'],
  ['src/portability.ts',
    'Import seeds a fresh store (law 9) via replaceAll. It does not run admit — it runs ' +
    'the gate\'s own QUESTION instead: inspectExport folds the candidate and refuses a ' +
    'file that would seed silent nodes, so a crafted file cannot do what admit exists ' +
    'to prevent. Shard take-in appends already-gated history (ADR-0035).'],
  ['src/ui/about.ts',
    'Two bookkeeping events with node: null (shard.folded, import.seeded). Neither ' +
    'creates or touches a node, so neither can leave one silent; the second appends ' +
    'raw deliberately because the session\'s folded state is stale by a whole store ' +
    'after an import, and committing through it would snapshot data that no longer exists.'],
  ['src/snapshot.ts',
    'putSnapshot writes no EVENTS — a snapshot is a photograph of a state the gate ' +
    'already admitted, and restoreFromLogAlone exists so a bad one can never be the ' +
    'truth (ADR-0006).'],
  ['src/purge.ts',
    'eraseEverything replaceAll([]) — the empty store. There is no node left to be ' +
    'silent, which is the one write admit could have nothing to say about. Guarded by ' +
    'the typed-word confirmation, not by the gate.'],
]);

/** Every .ts under src/, relative to the repo root. */
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.ts')) out.push(p);
  }
  return out;
}

const breaking = process.argv.includes('--break');
const found = new Map();                       // file -> [line numbers]

for (const file of walk(SRC)) {
  const rel = relative(ROOT, file).replaceAll('\\', '/');
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    // `store.append(`, `this.store.replaceAll(`, `session.store.reset(` …
    // Comments are ignored: this file is full of prose ABOUT the write API,
    // and a gate that cannot tell a mention from a call cries wolf until it
    // is switched off.
    const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
    if (!/\bstore\s*\.\s*(\w+)\s*\(/.test(code)) return;
    for (const m of code.matchAll(/\bstore\s*\.\s*(\w+)\s*\(/g)) {
      if (WRITE_API.includes(m[1])) {
        const at = found.get(rel) ?? [];
        at.push(i + 1);
        found.set(rel, at);
      }
    }
  });
}

// The proof: pretend an unlisted module writes raw. In memory only.
if (breaking) found.set('src/ui/pretend-bypass.ts', [1]);

console.log(`Write-gate bypass — ${found.size} module(s) touch the store's write API`);

for (const [file, lines] of [...found].sort()) {
  if (ALLOWED.has(file)) {
    pass(`${file} (lines ${lines.join(', ')}) — allowlisted`);
  } else {
    fail(`${file} (lines ${lines.join(', ')}) writes to the store without going through ` +
      'the gate, and is not allowlisted in tools/write-gate.mjs. Either commit through ' +
      '`session.commit` (which calls admit), or add an entry here saying why this write ' +
      'cannot leave a node silent.');
  }
}

// An allowlist entry for a module that no longer writes is stale permission —
// the shape that turns an allowlist into a list of things nobody checks.
for (const file of ALLOWED.keys()) {
  if (!found.has(file)) {
    fail(`${file} is allowlisted but no longer writes to the store — remove the entry, ` +
      'so the list stays a record of live decisions rather than of old ones');
  }
}

console.log('');
if (failures.length) {
  console.error(`${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log('Every write to the store goes through the gate, or is written down as to why not.');
