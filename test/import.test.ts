// Bringing a copy back (ADR-0006, law 9).
//
// The app could hand you your entire log and had no way to read one back, so a
// new device meant starting again. The round trip and the never-merge rule are
// covered in `spine.test.ts`; this file is about the SURFACE's half — describing
// a file truthfully before anything of the user's is at risk.
//
// The load-bearing property is that the description and the import cannot
// disagree. A surface that says "37 things, ready" and an import that then
// refuses is worse than either answer alone: the person has already decided.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MemoryLogStore } from '../src/log-store.ts';
import { fold, emptyState } from '../src/fold.ts';
import { admit, gateOptionsFor } from '../src/gate.ts';
import {
  exportAll, importSeedingFresh, inspectExport, toJsonl, fromJsonl, type ExportFile,
} from '../src/portability.ts';
import type { AppEvent } from '../src/events.ts';

const TZ = 'America/Denver';                    // never UTC (V-13)
const NOW = '2026-07-29T18:00:00.000Z';
const opts = gateOptionsFor(TZ);

let seq = 0;
const ev = (kind: string, node: string | null, payload: unknown): AppEvent =>
  ({ id: `e${seq}`, vault: 'personal', at: NOW, device: 'd0', seq: seq++, kind, node, payload } as AppEvent);

/** Override fields on an event WITHOUT spreading it. `AppEvent` is a large
 *  discriminated union, and `{...e, x}` makes tsc distribute the spread across
 *  every member — the check went from ten seconds to over three minutes.
 *  `Object.assign` on a plain object sidesteps the distribution entirely. */
const tweak = (base: AppEvent, over: Record<string, unknown>): AppEvent =>
  Object.assign({}, base as unknown as Record<string, unknown>, over) as unknown as AppEvent;

/** A real store, written the only way the app writes: through the gate. */
async function realStore(items: number): Promise<{ store: MemoryLogStore; file: ExportFile; held: number }> {
  const store = new MemoryLogStore();
  let state = emptyState();
  const accepted: AppEvent[] = [];
  for (let i = 0; i < items; i++) {
    const offered = [ev('capture.recorded', `n${i}`, { text: `thing ${i}`, source: 'quick', sourceTags: [] })];
    const admitted = admit(offered, state, opts);
    accepted.push(...admitted);
    state = fold(admitted, state);
  }
  await store.append(accepted);
  return { store, file: await exportAll(store, NOW), held: state.nodes.size };
}

test('a real export describes itself in numbers a person can check', async () => {
  const { file, held } = await realStore(4);
  const s = inspectExport(file);
  assert.deepEqual(s.refusals, [], 'a file this app wrote is always acceptable to it');
  assert.equal(s.items, held, 'the count is THINGS — the number someone can check against what they remember');
  assert.ok(s.events > s.items, 'and events are a different, larger number: the gate cures every capture');
  assert.equal(s.at, NOW);
  assert.equal(s.scope, 'all');
});

test('"things" means what the app means by it — not every node it ever made', () => {
  // The number a person compares against what they remember, seconds before
  // replacing everything. `nodes.size` counts the trashed and the merged, so it
  // reads higher than the gauge on the screen behind the panel — the same words
  // about the same store, two numbers. That exact mismatch shipped on the other
  // side of this comparison and no test saw it (audit).
  const log = toJsonl([
    ev('capture.recorded', 'KEPT', { text: 'kept', source: 'quick', sourceTags: [] }),
    ev('clock.set', 'KEPT', { clockKind: 'review', at: NOW, source: 'gate:capture.recorded' }),
    ev('capture.recorded', 'GONE', { text: 'let go', source: 'quick', sourceTags: [] }),
    ev('clock.set', 'GONE', { clockKind: 'review', at: NOW, source: 'gate:capture.recorded' }),
    ev('node.trashed', 'GONE', { reason: 'test' }),
  ]);
  const file = { format: 'planner-log', version: 1, at: NOW, scope: 'all', encrypted: false, logJsonl: log, snapshot: null };
  const s = inspectExport(file);
  assert.deepEqual(s.refusals, []);
  assert.equal(s.items, 1, 'one thing is held; the other was let go and is not a thing you have');
  assert.equal(fold(fromJsonl(log)).nodes.size, 2, 'though the log still remembers both, as it must');
});

test('inspectExport NEVER throws, whatever it is handed', () => {
  // A person chose a file. Whatever it turns out to be, they are owed a sentence
  // rather than a crash — and a crash here would come from the one surface
  // people reach for after something has already gone wrong.
  const nasty: unknown[] = [
    null, undefined, 0, '', 'not json', [], {}, { format: 'planner-log' },
    { format: 'planner-log', version: 1 },
    { format: 'planner-log', version: 1, logJsonl: 42 },
    { format: 'planner-log', version: 99, logJsonl: '' },
    { format: 'something-else', version: 1, logJsonl: '' },
    { format: 'planner-log', version: 1, logJsonl: '{"kind":"node.crea' },
    { format: 'planner-log', version: 1, logJsonl: '{"kind":"overdue.happened"}' },
    { format: 'planner-log', version: 1, logJsonl: '', at: 12345, scope: {} },
  ];
  for (const raw of nasty) {
    const s = inspectExport(raw);
    assert.ok(Array.isArray(s.refusals), `${JSON.stringify(raw)} returned a summary`);
    for (const r of s.refusals) {
      // LEADS with a finished sentence. Not "ends with a period" — some
      // refusals carry a technical detail in brackets after the sentence, which
      // is useful to anyone who opens the file and is not the part a person
      // reads. What must never happen is a raw thrown message arriving as-is:
      // "Cannot read properties of null (reading 'name')" has a capital and no
      // sentence at all, and still fails this.
      assert.match(r, /^[A-Z][^.!]{14,}[.!]/, `"${r}" leads with a sentence, not a code fragment`);
    }
  }
});

test('an empty export is acceptable — it is not an error to have nothing', () => {
  const empty: ExportFile = {
    format: 'planner-log', version: 1, at: NOW, scope: 'all',
    encrypted: false, logJsonl: '', snapshot: null,
  };
  const s = inspectExport(empty);
  assert.deepEqual(s.refusals, [], 'a new user exporting immediately has an empty, valid file');
  assert.equal(s.items, 0);
  assert.equal(s.events, 0);
});

test('a file that would seed invisible items is refused, and says how many', () => {
  // Import does not go through the gate, so it is a second write path: a crafted
  // file could seed nodes with no clock, no surface and no parent — items the
  // app would hold and never show anyone (law 1).
  const silent = toJsonl([ev('node.created', 'GHOST', { nodeKind: 'action', title: 'invisible' })]);
  const file = { format: 'planner-log', version: 1, at: NOW, scope: 'all', encrypted: false, logJsonl: silent, snapshot: null };
  const s = inspectExport(file);
  assert.equal(s.refusals.length, 1);
  assert.match(s.refusals[0]!, /1 item/, 'it says how many, not just that something is wrong');
  assert.match(s.refusals[0]!, /GHOST/, 'and names them, so the refusal explains itself');
});

test('THE ONE THAT MATTERS: the description and the import never disagree', async () => {
  const { file } = await realStore(3);
  const cases: [string, unknown][] = [
    ['a real export', file],
    ['empty log', { ...file, logJsonl: '' }],
    ['wrong format', { ...file, format: 'something-else' }],
    ['wrong version', { ...file, version: 2 }],
    ['no log at all', { ...file, logJsonl: undefined }],
    ['truncated', { ...file, logJsonl: '{"kind":"node.crea' }],
    ['unknown kind', { ...file, logJsonl: '{"kind":"overdue.happened","id":"x","seq":0,"device":"d","vault":"personal","at":"' + NOW + '"}' }],
    ['would be silent', { ...file, logJsonl: toJsonl([ev('node.created', 'G2', { nodeKind: 'action', title: 'x' })]) }],
    ['not an object', 'nonsense'],
    ['null', null],
  ];
  for (const [name, raw] of cases) {
    const predicted = inspectExport(raw).refusals.length > 0;
    const store = new MemoryLogStore();
    await store.append([ev('capture.recorded', 'MINE', { text: 'my data', source: 'quick', sourceTags: [] })]);
    let threw = false;
    try {
      await importSeedingFresh(store, raw as ExportFile);
    } catch {
      threw = true;
    }
    assert.equal(threw, predicted,
      `${name}: the surface said ${predicted ? 'refused' : 'ready'} and the import ${threw ? 'refused' : 'accepted'}`);
    // AND: a refusal must leave what was already there completely alone. The
    // whole point of describing before destroying is that a bad file costs
    // nothing.
    if (threw) {
      const after = await store.all();
      assert.equal(after.length, 1, `${name}: a refused import touched the existing data`);
      assert.equal(after[0]!.node, 'MINE', `${name}: and it is still theirs`);
    }
  }
});

test('a refused import says nothing was touched, in the same breath', async () => {
  const store = new MemoryLogStore();
  await store.append([ev('capture.recorded', 'MINE', { text: 'my data', source: 'quick', sourceTags: [] })]);
  await assert.rejects(
    () => importSeedingFresh(store, { format: 'nope' } as unknown as ExportFile),
    (err: Error) => {
      assert.match(err.message, /nothing was imported/i);
      assert.match(err.message, /untouched/i);
      return true;
    });
});

test('a successful import replaces rather than merges, and the store reads back', async () => {
  const { file } = await realStore(3);
  const store = new MemoryLogStore();
  await store.append([ev('capture.recorded', 'OLD', { text: 'previous life', source: 'quick', sourceTags: [] })]);
  const { events } = await importSeedingFresh(store, file);
  const after = await store.all();
  assert.equal(after.length, events, 'exactly what the file held');
  assert.equal(after.some(e => e.node === 'OLD'), false, 'and nothing of the old store survived — it seeds fresh');
  const s = inspectExport(file);
  assert.equal(fold(after).nodes.size, s.items + 0, 'what was promised is what arrived');
});

// --- what the audit found, each pinned so it cannot come back ---------------

test('CRITICAL: a file that would fail on WRITE is refused on READ', async () => {
  // The worst defect this app has had. Two events sharing an id: `inspectExport`
  // never looked at ids, `store.append` enforces them, and the order was
  // reset-then-append — so the store was already empty when the write failed.
  // The person's real items were gone, replaced by whichever rows landed first,
  // and all they were shown was a raw database error.
  const dup = ev('capture.recorded', 'A', { text: 'one', source: 'quick', sourceTags: [] });
  const log = toJsonl([
    dup,
    ev('clock.set', 'A', { clockKind: 'review', at: NOW, source: 'gate:capture.recorded' }),
    tweak(dup, { node: 'B' }),                  // SAME id, different node
    ev('clock.set', 'B', { clockKind: 'review', at: NOW, source: 'gate:capture.recorded' }),
  ]);
  const file = { format: 'planner-log', version: 1, at: NOW, scope: 'all', encrypted: false, logJsonl: log, snapshot: null };
  const s = inspectExport(file);
  assert.equal(s.refusals.length, 1, 'it is refused while the user still has everything');
  assert.match(s.refusals[0]!, /same record twice/);

  const store = new MemoryLogStore();
  await store.append([ev('capture.recorded', 'MINE', { text: 'my real data', source: 'quick', sourceTags: [] })]);
  await assert.rejects(() => importSeedingFresh(store, file as ExportFile));
  const after = await store.all();
  assert.equal(after.length, 1, 'and the store is untouched');
  assert.equal(after[0]!.node, 'MINE');
});

test('replaceAll is atomic — a half-import is not a state this app can be in', async () => {
  // Validation cannot rule out a quota or disk failure partway through a write,
  // so the operation itself must be all-or-nothing. `reset()` then `append()`
  // could never be.
  const store = new MemoryLogStore();
  const mine = ev('capture.recorded', 'MINE', { text: 'my real data', source: 'quick', sourceTags: [] });
  await store.append([mine]);
  const exploding = { get length(): number { throw new Error('disk full'); } } as unknown as AppEvent[];
  await assert.rejects(() => store.replaceAll(exploding));
  assert.deepEqual(await store.all(), [mine], 'the old data is still all there');
});

test('every question the STORE will ask is asked before anything is destroyed', () => {
  // Import used to run none of the gate's shape checks, so a hand-edited file
  // could carry these straight in. `seq: 1e999` was the worst: `nextSeq` returns
  // max + 1, and Infinity + 1 is Infinity, so every future write was refused —
  // a permanently unwritable store.
  const bad: [string, Record<string, unknown>][] = [
    ['negative seq', { seq: -5 }],
    ['fractional seq', { seq: 1.5 }],
    ['infinite seq', { seq: Infinity }],
    ['unparseable date', { at: 'not-a-date' }],
    ['no vault', { vault: '' }],
  ];
  for (const [name, over] of bad) {
    const e = tweak(ev('capture.recorded', 'X', { text: 'x', source: 'quick', sourceTags: [] }), over);
    const log = toJsonl([e]);
    const s = inspectExport({ format: 'planner-log', version: 1, at: NOW, scope: 'all', encrypted: false, logJsonl: log, snapshot: null });
    assert.ok(s.refusals.length > 0, `${name} is refused`);
    assert.match(s.refusals[0]!, /^That file/, `${name}: and refused in a sentence`);
  }
});

test('a payload the fold would choke on is an answer, not a crash', () => {
  // `fold` reads payload fields unguarded, and those calls sat outside the only
  // try in `inspectExport` — so `payload: null` threw a TypeError out of a
  // function whose entire contract is that it never throws. The surface, which
  // had wrapped only `JSON.parse`, then sat on "Reading it…" for ever.
  const shapes = [
    '{"kind":"vault.created","id":"a","seq":0,"device":"d","vault":"personal","at":"' + NOW + '","payload":null}',
    '{"kind":"capture.recorded","id":"b","seq":0,"device":"d","vault":"personal","at":"' + NOW + '","node":"n"}',
    '{"kind":"node.created","id":"c","seq":0,"device":"d","vault":"personal","at":"' + NOW + '","node":"n","payload":null}',
    '{"kind":"capture.recorded","id":"d","seq":0,"device":"d","vault":"personal","at":"' + NOW + '","node":"n","payload":{"text":"x","source":"quick","sourceTags":5}}',
  ];
  for (const line of shapes) {
    const s = inspectExport({ format: 'planner-log', version: 1, at: NOW, scope: 'all', encrypted: false, logJsonl: line, snapshot: null });
    assert.ok(s.refusals.length > 0, `${line.slice(0, 40)}… is refused rather than thrown`);
    assert.match(s.refusals[0]!, /^[A-Z][^.!]{14,}[.!]/, 'and leads with a sentence');
  }
});

test('reset does not throw away what the file never held', async () => {
  // A successful import used to clear the kv store too, taking the in-flight
  // capture draft — the thing ADR-0008 exists to protect — the device id, and
  // whether the intro had been seen. None of that is in the file, so none of it
  // is the file's to replace. Only `MemoryLogStore` behaved correctly, which is
  // why no test could see it.
  const store = new MemoryLogStore();
  await store.setKv('capture.draft', 'half a thought');
  await store.setKv('device.id', 'dev-abc');
  await store.append([ev('capture.recorded', 'OLD', { text: 'old', source: 'quick', sourceTags: [] })]);
  await store.reset();
  assert.equal(await store.getKv('capture.draft'), 'half a thought', 'the draft survives');
  assert.equal(await store.getKv('device.id'), 'dev-abc', 'and so does this device’s identity');
});
