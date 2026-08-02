// Every noun accounts for itself (1.14.2, ADR-0064).
//
// ## The defect this exists to prevent
//
// Twice in one day, the same shape: `export.written` had been recorded since
// Phase 0 and read by nothing, so no surface could say when a copy last left
// (ADR-0062); `snapshot.written` was declared in Phase 0 and written by nothing,
// so every cold start replayed the whole log (ADR-0063). Both were invisible.
// Every instrument reported success — the types compiled, the vocabulary gate
// passed, the tests were green — because a noun that nothing writes breaks
// nothing. It simply means a feature the record insists exists does not.
//
// A vocabulary is a set of PROMISES. This gate makes each one answerable: a kind
// is either written by the app, or the vocabulary says in words that it is not
// and why. There is no third state, and "nobody noticed" stops being available.
//
// ## What counts as written
//
// A reference to the kind's string literal anywhere in `src/` other than the
// four files that necessarily name every kind whether or not it is alive:
//
//   events.ts    — declares them all
//   log-words.ts — renders them all, by design (its totality test insists)
//   fold.ts      — folds the ones that fold; folding is READING, not writing
//   snapshot.ts  — serialises folded state
//
// Deliberately crude. A precise emit-detector would need to understand every
// intent builder, the gate's cures and the sync layer, and would itself be a
// thing that could quietly stop working. Grep is legible, has no failure mode
// worth debugging, and errs toward calling a kind written — which is the safe
// direction, because the annotation it would otherwise demand is cheap.
//
// ## What counts as accounted for
//
// A paragraph in the vocabulary containing both the kind in backticks and the
// word "unemitted". Prose, not a machine field: the point is that somebody had
// to write a sentence a reader can act on, which is the same mechanism as
// `MERGE_DISPOSITION` (1.9.2) — a reasoned "no" is a fine answer, and forcing
// the sentence IS the gate.
//
// It checks BOTH directions. A kind the app now writes must not still be
// described as unemitted, or the note becomes the next quiet lie.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VOCAB = join(ROOT, 'docs', 'event-vocabulary.md');

/** The files that name every kind whether or not anything writes it. */
const DECLARERS = new Set([
  'src/events.ts', 'src/log-words.ts', 'src/fold.ts', 'src/snapshot.ts',
]);

const failures = [];
const fail = (m) => { failures.push(m); console.error(`  FAIL  ${m}`); };
const pass = (m) => console.log(`  ok    ${m}`);

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const p = join(dir, name);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

const srcFiles = walk(join(ROOT, 'src'))
  .filter(p => p.endsWith('.ts'))
  .map(p => [p.slice(ROOT.length + 1), readFileSync(p, 'utf8')]);

const events = readFileSync(join(ROOT, 'src', 'events.ts'), 'utf8');
const block = /export const EVENT_KINDS[^=]*=\s*\[(.*?)\]\s*as const/s.exec(events);
if (!block) {
  fail('EVENT_KINDS could not be read from src/events.ts — this gate is blind');
} else {
  const kinds = [...block[1].matchAll(/'([a-z0-9.\-]+)'/g)].map(m => m[1]);
  pass(`${kinds.length} kinds in the closed list`);

  // The doc is parsed into per-KIND blocks, not paragraphs. A bullet list has no
  // blank lines in it, so paragraph-splitting made all of section G one lump and
  // a note about one kind vouched for every kind beside it — which is exactly
  // the sloppiness this gate exists to refuse. A block runs from a kind's own
  // bullet to the next kind's bullet or the next heading, so sub-bullets and a
  // following blockquote belong to the entry they sit under, and a note has to
  // be BESIDE the thing it is about to count.
  const vocab = readFileSync(VOCAB, 'utf8');
  const kindSet = new Set(kinds);
  const blocks = new Map();     // kind -> its text
  {
    const lines = vocab.split('\n');
    let current = [];
    let owners = [];
    const close = () => {
      const text = current.join('\n');
      for (const k of owners) blocks.set(k, (blocks.get(k) ?? '') + '\n' + text);
      current = []; owners = [];
    };
    for (const line of lines) {
      const isEntry = /^- \*\*`/.test(line);
      if (isEntry || /^#/.test(line)) close();
      if (isEntry) {
        const ticks = [...line.matchAll(/`([a-z0-9.\-]+)`/g)].map(m => m[1]);
        const first = ticks.find(t => kindSet.has(t));
        for (const t of ticks) {
          if (kindSet.has(t)) owners.push(t);
          // `- **`vault.locked` / `.unlocked`**` — the shorthand second half,
          // expanded against the first name's prefix.
          else if (t.startsWith('.') && first) {
            const merged = `${first.slice(0, first.lastIndexOf('.'))}${t}`;
            if (kindSet.has(merged)) owners.push(merged);
          }
        }
      }
      if (owners.length) current.push(line);
    }
    close();
  }
  const missingEntry = kinds.filter(k => !blocks.has(k));
  if (missingEntry.length) {
    for (const k of missingEntry) fail(`${k} has no entry of its own in the vocabulary`);
  } else {
    pass('every kind has an entry of its own in the vocabulary');
  }

  const written = [];
  const silent = [];
  for (const kind of kinds) {
    const needle = `'${kind}'`;
    const writer = srcFiles.find(([rel, text]) => !DECLARERS.has(rel) && text.includes(needle));
    (writer ? written : silent).push(kind);
  }

  const noted = new Set(kinds.filter(k => /unemitted/i.test(blocks.get(k) ?? '')));

  const unaccounted = silent.filter(k => !noted.has(k));
  if (unaccounted.length) {
    for (const k of unaccounted) {
      fail(`${k} is written by nothing and the vocabulary does not say so — add a note beside it in ${'docs/event-vocabulary.md'} using the word "unemitted", saying whether it is reserved, deferred or superseded`);
    }
  } else {
    pass(`${silent.length} kinds are written by nothing, and every one of them says so in the vocabulary`);
  }

  // The reverse: a note that has gone stale is the next quiet lie.
  const staleNotes = written.filter(k => noted.has(k));
  if (staleNotes.length) {
    for (const k of staleNotes) {
      fail(`${k} IS written by the app, but the vocabulary still calls it unemitted — the note is now false`);
    }
  } else {
    pass(`${written.length} written kinds, none of them still described as unemitted`);
  }
}

console.log('');
if (failures.length) {
  console.error(`${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log('Every noun in the vocabulary is either written by the app or says why it is not.');
