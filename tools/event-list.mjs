// The closed-event-list gate (build-plan §5 check 4).
//
// docs/event-vocabulary.md says the list is closed — *"a writer emitting an
// unlisted `kind` is rejected, not ignored — silent tolerance is how a schema
// rots"* — and CLAUDE.md calls that file the source of truth: **"Nothing is
// stored that is not an event named here."** Both were true of the RUNTIME
// (`isKnownKind` refuses an unlisted kind at two boundaries) and neither was
// checked against the DOCUMENT. So the code's list and the document that
// governs it could drift silently, and did: the vocabulary described
// `delta.recorded`'s payload as `sinceAnchor | sinceExport` while the type
// said `{ since: 'anchor' | 'export' }`.
//
// This asserts the two agree, in BOTH directions, plus the Silent? column —
// which the doc itself calls "the machine-checkable form of product law 1"
// and which nothing had ever machine-checked.
//
//   node tools/event-list.mjs
//   node tools/event-list.mjs --break   deliberate-failure proof (see below)
//
// Exits non-zero on any disagreement. A gate that warns is not a gate.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVENT_KINDS, SILENT_RISK_KINDS } from '../src/events.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOC = join(ROOT, 'docs', 'event-vocabulary.md');

const failures = [];
const fail = (m) => { failures.push(m); console.error(`  FAIL  ${m}`); };
const pass = (m) => console.log(`  ok    ${m}`);

/**
 * The kinds the DOCUMENT declares, read from § 3 only.
 *
 * An entry is a top-level bullet naming a kind in backticks; the `Silent
 * risk:` line beneath it belongs to the entry above. Some entries name two
 * kinds at once (`stakeholder.added` / `.removed`), which the parser expands
 * — a shorthand a reader understands and a naive regex would silently drop,
 * turning a documented noun into a phantom absence.
 */
function fromDoc(text) {
  const start = text.indexOf('## 3 · The closed event list');
  if (start < 0) throw new Error('§ 3 is not in docs/event-vocabulary.md — has it been renamed?');
  const after = text.indexOf('\n## ', start + 1);
  const body = text.slice(start, after < 0 ? undefined : after);

  const out = new Map();                       // kind -> { silent: boolean }
  let current = [];
  for (const line of body.split('\n')) {
    // A top-level bullet whose BOLD RUN names one or more kinds in backticks.
    // The bold run may hold several — "`stakeholder.added` / `.removed`" — so
    // it is read whole and the names extracted from it. Reading only the
    // first backticked token (the obvious regex) silently dropped ten
    // documented nouns and reported the DOC as the thing at fault, which is
    // the failure mode a gate must never have.
    const entry = /^- \*\*(.+?)\*\*/.exec(line);
    const names = entry ? [...entry[1].matchAll(/`(\.?[a-z][a-z0-9.\-]*)`/g)].map(m => m[1]) : [];
    if (names.length) {
      const stem = names[0].split('.').slice(0, -1).join('.');
      // A leading dot is shorthand for "same stem as the one before it".
      current = names.map(w => (w.startsWith('.') ? `${stem}${w}` : w));
      for (const k of current) if (!out.has(k)) out.set(k, { silent: false });
      continue;
    }
    const risk = /^\s+- Silent risk:\s*(.*)$/.exec(line);
    if (risk && current.length) {
      // "**yes — gated**", "**yes**", "no", "no — renaming removes no coverage".
      const silent = /^\**yes/i.test(risk[1].trim());
      for (const k of current) out.set(k, { silent });
      current = [];
    }
  }
  return out;
}

const raw = readFileSync(DOC, 'utf8');
// --break rewrites the doc IN MEMORY ONLY, to prove the gate bites. Nothing is
// written to disk: a proof that alters the repo is a proof nobody dares run.
const text = process.argv.includes('--break')
  ? raw.replace('- **`node.renamed`**', '- **`node.renamed.oops`**')
  : raw;

const doc = fromDoc(text);
const code = new Set(EVENT_KINDS);
const codeSilent = new Set(SILENT_RISK_KINDS);

console.log(`Closed event list — ${code.size} kinds in code, ${doc.size} in the vocabulary`);

const missingFromDoc = [...code].filter(k => !doc.has(k));
if (missingFromDoc.length) {
  fail(`emitted kinds absent from docs/event-vocabulary.md § 3: ${missingFromDoc.join(', ')} — ` +
    'the doc is the source of truth, so a kind it does not name is a kind nothing agreed to store');
} else {
  pass('every kind in the code is named in the vocabulary');
}

const missingFromCode = [...doc.keys()].filter(k => !code.has(k));
if (missingFromCode.length) {
  fail(`documented kinds absent from EVENT_KINDS: ${missingFromCode.join(', ')} — ` +
    'a documented noun nothing can emit is a promise the app cannot keep');
} else {
  pass('every kind in the vocabulary exists in the code');
}

// The Silent? column IS product law 1 in machine-checkable form, by the doc's
// own words. Nothing had ever checked it.
const riskDrift = [];
for (const [kind, { silent }] of doc) {
  if (!code.has(kind)) continue;
  const inCode = codeSilent.has(kind);
  if (silent !== inCode) {
    riskDrift.push(`${kind} (doc says ${silent ? 'yes' : 'no'}, code says ${inCode ? 'yes' : 'no'})`);
  }
}
if (riskDrift.length) {
  fail(`Silent? disagrees between the doc and SILENT_RISK_KINDS: ${riskDrift.join('; ')} — ` +
    'the column the vocabulary calls "the machine-checkable form of product law 1"');
} else {
  pass('and the Silent? column agrees with SILENT_RISK_KINDS for every one of them');
}

console.log('');
if (failures.length) {
  console.error(`${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log('The code and the vocabulary name exactly the same events, with the same risk.');
