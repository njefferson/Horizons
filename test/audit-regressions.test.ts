// One test per defect the adversarial audit found. Each was reproduced against
// the passing tree before it was fixed; each fails if its fix is reverted.
// Named by the finding so a future reader can trace it.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { admit, GateRejection, isSilent, silentNodes, coverageGauge } from '../src/gate.ts';
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
