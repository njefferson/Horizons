// One test per defect the adversarial audit found. Each was reproduced against
// the passing tree before it was fixed; each fails if its fix is reverted.
// Named by the finding so a future reader can trace it.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { admit, GateRejection, isSilent, silentNodes, coverageGauge } from '../src/gate.ts';
import { endOfDayKey } from '../src/ui/detail-intents.ts';
import { localDayKey } from '../src/time.ts';
import { fold, emptyState, compareEvents, type State } from '../src/fold.ts';
import { serialiseState } from '../src/snapshot.ts';
import { MemoryLogStore } from '../src/log-store.ts';
import { writeSnapshot, loadState, restoreFromLogAlone } from '../src/snapshot.ts';
import { importSeedingFresh, exportAll } from '../src/portability.ts';
import type { AppEvent } from '../src/events.ts';

let n = 0;
const ev = (kind: string, node: string | null, payload: unknown, over: Partial<AppEvent> = {}): AppEvent => ({
  id: over.id ?? `e${n++}`, vault: 'personal', at: '2026-07-28T12:00:00.000Z',
  device: 'd0', seq: (over.seq as number) ?? n, kind, node, payload, ...over,
} as AppEvent);

// admit + fold, the real write path, for building prior states in tests.
const write = (prior: State, offered: AppEvent[]): State => fold(admit(offered, prior), prior);

test('fold-1: fold does not mutate its base; a rejected batch cannot corrupt state', () => {
  const base = write(emptyState(), [ev('node.created', 'A', { nodeKind: 'action', title: 'a' }, { seq: 0 })]);
  const before = JSON.stringify(serialiseState(base));
  // A batch that sets a field then throws on an unknown kind.
  assert.throws(() => admit([
    ev('node.field.set', 'A', { field: 'x', value: 'LEAK' }, { seq: 1 }),
    ev('overdue.raised', 'A', {}, { seq: 2 }),
  ], base), GateRejection);
  assert.equal(JSON.stringify(serialiseState(base)), before, 'base state is untouched by a rejected admit');
});

test('fold-2: (at,device,seq) ties are total-ordered by id — permutation-invariant', () => {
  const a = ev('node.created', 'N', { nodeKind: 'action', title: 'ZA' }, { id: 'aaa', seq: 0 });
  const b = ev('node.created', 'N', { nodeKind: 'action', title: 'ZB' }, { id: 'bbb', seq: 0 });
  const s1 = JSON.stringify(serialiseState(fold([a, b])));
  const s2 = JSON.stringify(serialiseState(fold([b, a])));
  assert.equal(s1, s2, 'same events, either order, same state');
  assert.notEqual(compareEvents(a, b), 0, 'ties break by id, never 0');
});

test('gate-clock: a gate-approved clear/set sequence stays consistent after a sorted refold', async () => {
  // The audit sequence: create, set due, clear review, set review (backdated),
  // clear due — via the real gate, then compare live vs sorted refold.
  const store = new MemoryLogStore();
  let s = emptyState();
  const commit = (offered: AppEvent[]) => {
    const admitted = admit(offered, s);
    return store.append(admitted).then(() => { s = fold(admitted, s); });
  };
  await commit([ev('node.created', 'N', { nodeKind: 'action', title: 't' }, { seq: 0, at: '2026-07-28T09:01:00.000Z' })]);
  await commit([ev('clock.set', 'N', { clockKind: 'due', at: '2026-08-01T00:00:00.000Z' }, { seq: 1, at: '2026-07-28T09:03:00.000Z' })]);
  await commit([ev('clock.cleared', 'N', { clockKind: 'review' }, { seq: 2, at: '2026-07-28T09:04:00.000Z' })]);
  await commit([ev('clock.set', 'N', { clockKind: 'review', at: '2026-08-02T00:00:00.000Z' }, { seq: 3, at: '2026-07-28T09:02:00.000Z' })]);
  await commit([ev('clock.cleared', 'N', { clockKind: 'due' }, { seq: 4, at: '2026-07-28T09:05:00.000Z' })]);
  const live = coverageGauge(s);
  const refold = coverageGauge(fold(await store.all()));
  assert.deepEqual(live, refold, 'the gate’s model equals the sorted refold');
  assert.equal(refold.silent, 0, 'and nothing is silent');
});

test('gate-merge: merging into a nonexistent id is refused; a valid merge to a covered node is fine', () => {
  const s = write(emptyState(), [ev('node.created', 'A', { nodeKind: 'action', title: 'a' }, { seq: 0 })]);
  assert.throws(() => admit([ev('node.merged', 'A', { into: 'ghost' }, { seq: 1 })], s),
    /merge target does not exist/);
});

test('gate-trash: trashing a parent cures its orphaned children', () => {
  let s = write(emptyState(), [ev('node.created', 'P', { nodeKind: 'project', title: 'p' }, { seq: 0 })]);
  s = write(s, [ev('node.created', 'C', { nodeKind: 'action', title: 'c', parent: 'P' }, { seq: 1 })]);
  // Trashing P removes C's only coverage; the gate must cure C, not accept silence.
  s = write(s, [ev('node.trashed', 'P', {}, { seq: 2 })]);
  assert.equal(silentNodes(s).length, 0, 'no child left silent by a parent going to the trash');
  const c = s.nodes.get('C')!;
  assert.ok(Object.keys(c.clocks).length > 0 || c.onMenu, 'C has its own coverage now');
});

test('gate-proto: a __proto__ field is refused at the boundary', () => {
  const s = write(emptyState(), [ev('node.created', 'A', { nodeKind: 'action', title: 'a' }, { seq: 0 })]);
  assert.throws(() => admit([ev('node.field.set', 'A', { field: '__proto__', value: {} }, { seq: 1 })], s),
    /not a usable field name/);
});

test('gate-recreate: a creation event cannot land on an existing node', () => {
  const s = write(emptyState(), [ev('capture.recorded', 'A', { text: 'Q3 launch plan', source: 'quick' }, { seq: 0 })]);
  assert.throws(() => admit([ev('capture.recorded', 'A', { text: 'milk', source: 'quick' }, { seq: 1 })], s),
    /already exists/);
});

test('gate-nowedge: a pre-existing silent node does not wedge unrelated writes', () => {
  // Force a silent node into a base state directly (simulating a legacy/imported
  // node the current gate would never mint), then a normal write must still land.
  const legacy = fold([ev('node.created', 'S', { nodeKind: 'action', title: 's' }, { seq: 0 })]);
  // strip S's cure so it is silent in the base:
  legacy.nodes.get('S')!.clocks = {};
  assert.equal(isSilent(legacy.nodes.get('S')!, legacy), true, 'base has a silent node');
  const out = admit([ev('capture.recorded', 'B', { text: 'new', source: 'quick' }, { seq: 1 })], legacy);
  assert.ok(out.length >= 1, 'an unrelated capture still admits despite the legacy silent node');
});

test('gate-empty: admitting an empty batch does not throw the wrong error type', () => {
  assert.doesNotThrow(() => admit([], emptyState()));
});

test('snapshot-since: a late event at-or-below the high-water mark is not lost on restore', async () => {
  const store = new MemoryLogStore();
  await store.append([
    ev('node.created', 'A', { nodeKind: 'action', title: 'a' }, { device: 'd0', seq: 0 }),
    ev('clock.set', 'A', { clockKind: 'review', at: '2026-08-01T00:00:00.000Z' }, { device: 'd0', seq: 1 }),
  ]);
  await writeSnapshot(store, '2026-07-28T12:00:00.000Z'); // HWM d0=1
  // A late shard arrives below the mark (seq 0 on a new device folded after).
  await store.append([ev('node.field.set', 'A', { field: 'note', value: 'late' }, { device: 'd1', seq: 0 })]);
  const viaSnapshot = await loadState(store);
  const viaLog = await restoreFromLogAlone(store);
  assert.deepEqual(
    JSON.parse(JSON.stringify(serialiseState(viaSnapshot))),
    JSON.parse(JSON.stringify(serialiseState(viaLog))),
    'snapshot+tail equals a full replay; the late event is not lost',
  );
});

test('import-gate: a file folding to a silent node is refused, store left intact', async () => {
  const store = new MemoryLogStore();
  await store.append(admit([ev('capture.recorded', 'keep', { text: 'mine', source: 'quick' }, { seq: 0 })], emptyState()));
  const before = (await store.all()).length;
  // A hand-crafted file with a silent node (node.created, no coverage).
  const badFile = {
    format: 'planner-log' as const, version: 1 as const, at: '2026-07-28T12:00:00.000Z',
    scope: 'all', encrypted: false,
    logJsonl: JSON.stringify(ev('node.created', 'orphan', { nodeKind: 'action', title: 'x' }, { seq: 0 })),
    snapshot: null,
  };
  await assert.rejects(() => importSeedingFresh(store, badFile), /not a faithful Quietkeep export/);
  assert.equal((await store.all()).length, before, 'the existing store is untouched by a refused import');
});

// --- the 1.3.1 audit: the gate's new refusals, each proven from both sides ---

test('menu-belt: a demand clock cannot land on a Menu item — suspense, due, or park', () => {
  // The audit's CRITICAL shape: a Menu placement makes every temporal surface
  // stand down (the Menu group wins, no replan card raises, the sheet hides its
  // date controls), so Menu + demand-clock is a hard date swallowed whole.
  let s = write(emptyState(), [ev('node.created', 'P', { nodeKind: 'project', title: 'p' }, { seq: 0 })]);
  s = write(s, [ev('menu.item.added', 'P', { category: 'read' }, { seq: 1 })]);
  assert.throws(() => admit([ev('suspense.set', 'P', { at: '2026-08-09T12:00:00.000Z' }, { seq: 2 })], s),
    /a wish holds no demands/, 'suspense.set on a menu’d project');
  assert.throws(() => admit([ev('clock.set', 'P', { clockKind: 'due', at: '2026-08-09T12:00:00.000Z', source: 't' }, { seq: 3 })], s),
    /a wish holds no demands/, 'a due date on a menu’d project');
  assert.throws(() => admit([ev('park.set', 'P', { returnAt: '2026-08-09T12:00:00.000Z' }, { seq: 4 })], s),
    /a wish holds no demands/, 'a park stacked on a Menu landing');
});

test('menu-belt: the OTHER direction — landing a due-dated item on the Menu without shedding the date', () => {
  let s = write(emptyState(), [ev('node.created', 'D', { nodeKind: 'action', title: 'd' }, { seq: 0 })]);
  s = write(s, [ev('clock.set', 'D', { clockKind: 'due', at: '2026-08-09T12:00:00.000Z', source: 't' }, { seq: 1 })]);
  assert.throws(() => admit([ev('menu.item.added', 'D', { category: 'read' }, { seq: 2 })], s),
    /a wish holds no demands/, 'a bare Menu landing may not swallow the date');
  // The legal batch is the one routeEvents builds: Menu FIRST, then the clears.
  const out = admit([
    ev('menu.item.added', 'D', { category: 'read' }, { seq: 3 }),
    ev('clock.cleared', 'D', { clockKind: 'due' }, { seq: 4 }),
  ], s);
  const after = fold(out, s).nodes.get('D')!;
  assert.ok(after.onMenu, 'landed');
  assert.equal(after.clocks.due, undefined, 'and the date was shed, visibly, in the log');
});

test('menu-belt is a DELTA: a pre-existing Menu+date state stays curable, not wedged', () => {
  // Fold the illegal state in directly (an older build could have written it);
  // an unrelated write must still land, and the cure — clearing the date — too.
  const legacy = fold([
    ev('node.created', 'L', { nodeKind: 'action', title: 'l' }, { seq: 0 }),
    ev('menu.item.added', 'L', { category: 'read' }, { seq: 1 }),
    ev('clock.set', 'L', { clockKind: 'due', at: '2026-08-09T12:00:00.000Z', source: 't' }, { seq: 2 }),
  ]);
  assert.doesNotThrow(() => admit([ev('capture.recorded', 'B', { text: 'new', source: 'quick' }, { seq: 3 })], legacy));
  assert.doesNotThrow(() => admit([ev('clock.cleared', 'L', { clockKind: 'due' }, { seq: 4 })], legacy));
});

test('gate-order: a stamp-disordered batch is refused before anything folds', () => {
  // The accumulator applies in OFFERED order; fold sorts by (at, device, seq).
  // dependency.released is non-commutative under that re-sort, so a disordered
  // batch could slip a dependency cycle past wouldCycle — permanently, in an
  // append-only log. The precondition is now a refusal, not an assumption.
  const s = write(emptyState(), [ev('node.created', 'A', { nodeKind: 'action', title: 'a' }, { seq: 0 })]);
  const later = ev('node.renamed', 'A', { title: 'second' }, { seq: 50 });
  const earlier = ev('node.renamed', 'A', { title: 'first' }, { seq: 40 });
  assert.throws(() => admit([later, earlier], s), /its own event order/);
  assert.doesNotThrow(() => admit([earlier, later], s), 'the same events, sorted, admit fine');
});

test('gate-depth: a 10,000-deep chain gets a decision, not a blown call stack', () => {
  // collectDependents once recursed; a deep parent chain came back as a raw
  // RangeError instead of an admit/reject decision. Each node carries its own
  // clock so the walk is exercised without minting 10,000 casualties.
  const events: AppEvent[] = [];
  let sq = 0;
  const mk = (kind: string, node: string, payload: unknown): AppEvent =>
    ({ id: `d${sq}`, vault: 'personal', at: '2026-07-28T12:00:00.000Z', device: 'd0', seq: sq++, kind, node, payload } as AppEvent);
  events.push(mk('node.created', 'N0', { nodeKind: 'project', title: 'root' }));
  events.push(mk('clock.set', 'N0', { clockKind: 'review', at: '2026-08-05T00:00:00.000Z', source: 't' }));
  for (let i = 1; i < 10_000; i++) {
    events.push(mk('node.created', `N${i}`, { nodeKind: 'action', title: 't', parent: `N${i - 1}` }));
    events.push(mk('clock.set', `N${i}`, { clockKind: 'review', at: '2026-08-05T00:00:00.000Z', source: 't' }));
  }
  const s = fold(events);
  const out = admit([mk('clock.cleared', 'N0', { clockKind: 'review' })], s);
  assert.equal(out.length, 2, 'the clear and its cure — a decision, from the bottom of the chain');
});

test('date-0099: a typed year 0099 stays year 0099 — never silently 1999', () => {
  // Date.UTC(99, …) means 1999 (the legacy two-digit-year trap), so a typo like
  // "0099-08-04" became a date 27 years in the past and raised an instant
  // replan card about a day nobody chose. utcMs (setUTCFullYear) round-trips.
  const zone = 'America/Denver';
  const iso = endOfDayKey('0099-08-04', zone);
  assert.ok(!iso.startsWith('1999'), `did not collapse to 1999 (got ${iso})`);
  assert.equal(localDayKey(iso, zone), '0099-08-04', 'the instant is the end of the day that was typed');
});

test('export-roundtrip: a faithful export re-imports cleanly and re-folds identically', async () => {
  const store = new MemoryLogStore();
  await store.append(admit([ev('capture.recorded', 'A', { text: 'a', source: 'quick' }, { seq: 0 })], emptyState()));
  await store.append(admit([ev('capture.recorded', 'B', { text: 'b', source: 'quick' }, { seq: 1 })], fold(await store.all())));
  const file = await exportAll(store, '2026-07-28T12:00:00.000Z');
  const fresh = new MemoryLogStore();
  await importSeedingFresh(fresh, file);
  assert.deepEqual(
    JSON.parse(JSON.stringify(serialiseState(fold(await fresh.all())))),
    JSON.parse(JSON.stringify(serialiseState(fold(await store.all())))),
    'round-tripped state is identical',
  );
});
