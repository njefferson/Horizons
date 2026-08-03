// The set covers the app (1.16.0, ADR-0067).
//
// ## The defect this exists to prevent
//
// `src/sample.ts` was written at 0.22.0 and was right. Sixteen releases later it
// contained **8 of the 70 event kinds the app emits** and 8 of its 14 node
// kinds, and nothing had ever said so. Every surface built after it — merges,
// dependencies, decisions, the ledger, the trash, Composed Today, focus, weight
// — had never once been seen with data in it. That is not a fixture going
// slightly stale; it is the app's own demonstration quietly ceasing to
// demonstrate the app, in a repo whose whole discipline is that claims get
// checked.
//
// It is the same shape as `emitters.mjs` (a noun nothing writes) and
// `MERGE_DISPOSITION` (a field nobody ruled on): something grows, a list beside
// it does not, and no instrument reports it because nothing is technically
// broken.
//
// ## What it checks
//
// It GENERATES the set and runs it through the real `admit`, then asks what
// kinds actually came out. Not a grep over the source — a grep would pass on a
// kind mentioned in a comment or built in a branch that never runs, and the
// whole point is what the set really contains.
//
// Both directions, like `emitters.mjs`:
//  - every emitted event kind is in the set, or exempted here with a reason;
//  - every node kind is in the folded state, or exempted here with a reason;
//  - **and an exemption for a kind the set now produces is itself a failure**,
//    or the reasons rot into the next quiet lie.
//
// ## Why exemptions exist at all
//
// A reasoned "no" is a fine answer and forcing the sentence IS the gate. What is
// not available is silence.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { bigSampleEvents } from '../src/big-sample.ts';
import { EVENT_KINDS, NODE_KINDS } from '../src/events.ts';
import { admit, gateOptionsFor } from '../src/gate.ts';
import { fold } from '../src/fold.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Event kinds the set deliberately does not contain, each with the reason.
 *
 * All eight are the same species: **acts of a device, not content of a life.**
 * They describe what this installation did — took a photograph of its own state,
 * handed out a copy, folded in another device's shard, noticed you had been away
 * — and an imported log carrying another device's greeting is noise rather than
 * data. None of them puts anything on a surface a reader is looking at.
 */
const EVENT_EXEMPT = {
  'snapshot.written': 'A device photographing its own state to start faster. The importing device cuts its own.',
  'export.written': 'A copy leaving THIS device. A generated file is not a copy of anybody\'s data, and recording one would make the panel\'s "Last copy" row claim a backup that does not exist.',
  'import.seeded': 'Written BY the import that brings this file in. Putting one inside the file would assert an import that had not happened yet.',
  'shard.folded': 'Another device\'s events arriving. Sync is between real devices; a fabricated shard receipt describes a device that does not exist.',
  'lapse.migration.ran': 'What the app does when you come back after a long absence. It runs against your own store on your own return, not against a fixture.',
  'reentry.greeted': 'The greeting shown on that return, naming the items it showed you. Another device\'s greeting is meaningless here.',
  'amnesty.offered': 'Offered at re-entry, for the same reason.',
  'amnesty.accepted': 'Your answer to that offer. A set cannot accept an amnesty on your behalf.',
};

/**
 * Node kinds the set deliberately does not contain.
 *
 * One, and it is not a choice about the fixture — it is the gate.
 */
const NODE_EXEMPT = {
  anchor: 'An anchor node would be a SILENT node today: `anchor` is not in DEMAND_FREE_KINDS, `anchor.defined` is not silent-risk and has no cure branch, so it has no clock, no Menu, no parent and no exemption. `admit` refuses it and `inspectExport` would refuse the file. ADR-0057 defers anchors for exactly this reason and says shipping them needs a gate change plus a surface in one release.',
};

const failures = [];
const fail = (m) => { failures.push(m); console.error(`  FAIL  ${m}`); };
const pass = (m) => console.log(`  ok    ${m}`);

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const p = join(dir, name);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

/** The files that name every kind whether or not anything writes it — the same
 *  four `emitters.mjs` excludes, plus this set itself, which would otherwise
 *  vouch for its own coverage. */
const DECLARERS = new Set([
  'src/events.ts', 'src/log-words.ts', 'src/fold.ts', 'src/snapshot.ts',
  'src/big-sample.ts',
]);

const sources = walk(join(ROOT, 'src'))
  .filter(f => f.endsWith('.ts'))
  .filter(f => !DECLARERS.has(relative(ROOT, f)));
const text = sources.map(f => readFileSync(f, 'utf8')).join('\n');
const emitted = EVENT_KINDS.filter(k => text.includes(`'${k}'`) || text.includes(`"${k}"`));

// --- generate it for real ---------------------------------------------------

const TZ = 'America/Denver';
const NOW = new Date().toISOString();
let n = 0, s = 0;
const ctx = {
  at: NOW, device: 'coverage', vault: 'personal', zone: TZ,
  seq: () => s++, id: () => `c${n++}`,
};

let admitted;
try {
  const offered = await bigSampleEvents(ctx, NOW);
  admitted = admit(offered, fold([]), gateOptionsFor(TZ));
  pass(`the set generates and passes the real write boundary (${offered.length} offered, ${admitted.length} admitted)`);
} catch (err) {
  fail(`the set does not pass the write boundary: ${err.message}`);
  process.exit(1);
}

const state = fold(admitted);
const haveEvents = new Set(admitted.map(e => e.kind));
const haveNodes = new Set([...state.nodes.values()].map(x => x.kind));

// --- event kinds, both directions -------------------------------------------

const missingEvents = emitted.filter(k => !haveEvents.has(k) && !(k in EVENT_EXEMPT));
if (missingEvents.length === 0) {
  pass(`every emitted event kind is in the set or exempted here (${haveEvents.size} present, ${Object.keys(EVENT_EXEMPT).length} exempt, of ${emitted.length} emitted)`);
} else {
  for (const k of missingEvents) {
    fail(`"${k}" is emitted by the app and is in no sample — generate one in src/big-sample.ts, or exempt it in tools/sample-coverage.mjs with the reason`);
  }
}

for (const k of Object.keys(EVENT_EXEMPT)) {
  if (haveEvents.has(k)) {
    fail(`"${k}" IS in the set but is still listed as exempt — remove its entry, or the reason beside it becomes the next quiet lie`);
  }
  if (!EVENT_KINDS.includes(k)) {
    fail(`"${k}" is exempted but is not an event kind at all — the vocabulary moved and this list did not`);
  }
}

// --- node kinds, both directions --------------------------------------------

const missingNodes = NODE_KINDS.filter(k => !haveNodes.has(k) && !(k in NODE_EXEMPT));
if (missingNodes.length === 0) {
  pass(`every node kind is in the set or exempted here (${haveNodes.size} present, ${Object.keys(NODE_EXEMPT).length} exempt, of ${NODE_KINDS.length})`);
} else {
  for (const k of missingNodes) {
    fail(`no "${k}" node is in the set — add one in src/big-sample.ts, or exempt it in tools/sample-coverage.mjs with the reason`);
  }
}

for (const k of Object.keys(NODE_EXEMPT)) {
  if (haveNodes.has(k)) {
    fail(`a "${k}" node IS in the set but the kind is still listed as exempt — remove its entry`);
  }
  if (!NODE_KINDS.includes(k)) {
    fail(`"${k}" is exempted but is not a node kind at all`);
  }
}

// --- and the exemptions have to actually say something ----------------------

for (const [k, why] of [...Object.entries(EVENT_EXEMPT), ...Object.entries(NODE_EXEMPT)]) {
  if (typeof why !== 'string' || why.trim().length < 40) {
    fail(`the exemption for "${k}" does not give a reason — a sentence somebody can act on is the whole mechanism`);
  }
}

if (failures.length > 0) {
  console.error(`\n${failures.length} coverage failure(s). The set has fallen behind the app.`);
  process.exit(1);
}
console.log('\nThe sample set covers every kind the app has, or says why not.');
