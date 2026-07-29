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
      assert.ok(r.length > 0 && /[.!]$/.test(r), `"${r}" is a finished sentence, not a code fragment`);
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
