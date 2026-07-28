// Phase 0 exit criteria. All four, or Phase 0 is not done (build-plan §3).
//
// The no-silent-nodes property is the highest-value test in the codebase, and
// it is made to FAIL once against a deliberately silent node before being
// trusted — a suite that has never been red proves nothing (Doctrine §6).

import test from 'node:test';
import assert from 'node:assert/strict';

import { admit, GateRejection, silentNodes, coverageGauge, isSilent } from '../src/gate.ts';
import { fold, emptyState, compareEvents } from '../src/fold.ts';
import { MemoryLogStore } from '../src/log-store.ts';
import { writeSnapshot, loadState, restoreFromLogAlone, serialiseState } from '../src/snapshot.ts';
import { exportAll, importSeedingFresh, toJsonl, fromJsonl } from '../src/portability.ts';
import { generateEvents, shuffle } from './generate.ts';
import type { AppEvent } from '../src/events.ts';

const SEEDS = [1, 2, 3, 7, 11, 42, 99, 123, 2026, 31337];
const gen = (seed: number, events = 160) =>
  generateEvents({ seed, events, devices: 3, vaults: ['work', 'personal'] });

/** Everything goes through the gate. Nothing in this file writes around it. */
function admitAll(events: readonly AppEvent[]) {
  let state = emptyState();
  const accepted: AppEvent[] = [];
  for (const e of events) {
    const batch = admit([e], state);
    accepted.push(...batch);
    state = fold(batch, state);
  }
  return { accepted, state };
}

// ---------------------------------------------------------------------------
// Exit criterion 1 — arbitrary valid sequences fold to ZERO silent nodes
// ---------------------------------------------------------------------------

test('property: no silent nodes, over generated logs', () => {
  for (const seed of SEEDS) {
    const { state } = admitAll(gen(seed));
    const silent = silentNodes(state);
    assert.equal(silent.length, 0,
      `seed ${seed}: ${silent.length} silent node(s): ${silent.map(n => `${n.id}(${n.kind})`).slice(0, 5).join(', ')}`);
    assert.ok(state.nodes.size > 0, `seed ${seed} produced no nodes — the generator is broken, not the gate`);
  }
});

test('the coverage gauge reads zero because the gate holds, not because it is unpopulated', () => {
  for (const seed of SEEDS.slice(0, 4)) {
    const { state } = admitAll(gen(seed));
    const g = coverageGauge(state);
    assert.equal(g.silent, 0);
    assert.ok(g.total > 5, `seed ${seed}: only ${g.total} nodes — gauge would be trivially zero`);
  }
});

// This is the "make it fail once" proof. If the property test cannot detect a
// node that IS silent, its passing tells us nothing.
test('the property test detects a deliberately silent node (proving it can fail)', () => {
  const silentByHand: AppEvent[] = [
    { id: 'v', vault: 'work', at: '2026-01-01T09:00:00.000Z', device: 'd0', seq: 0,
      kind: 'vault.created', node: null, payload: { name: 'work', domain: 'personal' } },
    { id: 'n', vault: 'work', at: '2026-01-01T09:01:00.000Z', device: 'd0', seq: 1,
      kind: 'node.created', node: 'orphan', payload: { nodeKind: 'action', title: 'no clock, no parent, no menu' } },
  ];
  // Folded WITHOUT the gate, this node is silent — that is the whole point.
  const ungated = fold(silentByHand);
  const silent = silentNodes(ungated);
  assert.equal(silent.length, 1, 'the detector failed to see an obviously silent node');
  assert.equal(silent[0]!.id, 'orphan');
  assert.ok(isSilent(silent[0]!, ungated));

  // And the gate refuses to let it happen: it cures the write instead.
  const cured = admit(silentByHand, emptyState());
  assert.ok(cured.length > silentByHand.length, 'the gate should have added a cure event');
  assert.equal(silentNodes(fold(cured)).length, 0, 'the gate let a silent node through');
});

test('the gate refuses an unknown event kind', () => {
  const bad = { id: 'x', vault: 'work', at: '2026-01-01T09:00:00.000Z', device: 'd0', seq: 0,
    kind: 'overdue.raised', node: 'n', payload: {} } as unknown as AppEvent;
  assert.throws(() => admit([bad], emptyState()), GateRejection);
});

test('the gate refuses a clock on a demand-free kind (law 6)', () => {
  const base: AppEvent[] = [
    { id: 'v', vault: 'work', at: '2026-01-01T09:00:00.000Z', device: 'd0', seq: 0,
      kind: 'vault.created', node: null, payload: { name: 'work', domain: 'personal' } },
    { id: 'a', vault: 'work', at: '2026-01-01T09:01:00.000Z', device: 'd0', seq: 1,
      kind: 'node.created', node: 'asp', payload: { nodeKind: 'aspiration', title: 'read that book' } },
  ];
  const state = fold(admit(base, emptyState()));
  const clock: AppEvent = { id: 'c', vault: 'work', at: '2026-01-01T09:02:00.000Z', device: 'd0', seq: 2,
    kind: 'clock.set', node: 'asp', payload: { clockKind: 'due', at: '2026-02-01T09:00:00.000Z' } };
  assert.throws(() => admit([clock], state), /cannot carry a clock/);
});

test('the gate refuses a cross-vault reference (ADR-0005)', () => {
  const base: AppEvent[] = [
    { id: 'v1', vault: 'work', at: '2026-01-01T09:00:00.000Z', device: 'd0', seq: 0,
      kind: 'vault.created', node: null, payload: { name: 'work', domain: 'work' } },
    { id: 'n1', vault: 'work', at: '2026-01-01T09:01:00.000Z', device: 'd0', seq: 1,
      kind: 'node.created', node: 'w1', payload: { nodeKind: 'project', title: 'work thing' } },
  ];
  const state = fold(admit(base, emptyState()));
  const cross: AppEvent = { id: 'x', vault: 'personal', at: '2026-01-01T09:02:00.000Z', device: 'd0', seq: 2,
    kind: 'node.created', node: 'p1', payload: { nodeKind: 'action', title: 'personal', parent: 'w1' } };
  assert.throws(() => admit([cross], state), /cross-vault/);
});

// ---------------------------------------------------------------------------
// Exit criterion 2 — fold is deterministic across arrival orders
// ---------------------------------------------------------------------------

test('property: fold is order-independent (shards may arrive in any order)', () => {
  for (const seed of SEEDS) {
    const { accepted } = admitAll(gen(seed));
    const canonical = serialiseState(fold(accepted));
    for (const shuffleSeed of [seed + 1000, seed + 2000, seed + 3000]) {
      const reordered = serialiseState(fold(shuffle(accepted, shuffleSeed)));
      assert.deepEqual(reordered, canonical,
        `seed ${seed}: fold disagreed after shuffle ${shuffleSeed}`);
    }
  }
});

test('property: folding in two halves equals folding all at once', () => {
  for (const seed of SEEDS.slice(0, 5)) {
    const { accepted } = admitAll(gen(seed));
    const sorted = [...accepted].sort(compareEvents);
    const mid = Math.floor(sorted.length / 2);
    const incremental = fold(sorted.slice(mid), fold(sorted.slice(0, mid)));
    assert.deepEqual(serialiseState(incremental), serialiseState(fold(accepted)),
      `seed ${seed}: incremental fold diverged from whole-log fold`);
  }
});

// ---------------------------------------------------------------------------
// Exit criterion 3 — export -> fresh store -> import -> identical state
// ---------------------------------------------------------------------------

test('round trip: export, import into a fresh store, identical state', async () => {
  for (const seed of SEEDS.slice(0, 5)) {
    const { accepted } = admitAll(gen(seed));
    const a = new MemoryLogStore();
    await a.append(accepted);
    await writeSnapshot(a, '2026-01-02T00:00:00.000Z');
    const before = serialiseState(await loadState(a));

    const file = await exportAll(a, '2026-01-02T00:00:00.000Z');

    const b = new MemoryLogStore();
    const { events } = await importSeedingFresh(b, file);
    assert.equal(events, accepted.length, `seed ${seed}: event count changed across the round trip`);
    assert.deepEqual(serialiseState(await loadState(b)), before, `seed ${seed}: state differed after import`);
  }
});

test('import seeds fresh — it never merges (ADR-0006)', async () => {
  const { accepted } = admitAll(gen(5));
  const a = new MemoryLogStore();
  await a.append(accepted);
  const file = await exportAll(a, '2026-01-02T00:00:00.000Z');

  // A store that already holds unrelated data.
  const b = new MemoryLogStore();
  await b.append(admitAll(gen(6)).accepted);
  const otherCount = (await b.all()).length;
  assert.ok(otherCount > 0);

  await importSeedingFresh(b, file);
  const after = await b.all();
  assert.equal(after.length, accepted.length,
    'import merged instead of seeding fresh — law 9 violation');
});

test('jsonl round-trips, and a truncated file names the bad line', () => {
  const { accepted } = admitAll(gen(9, 40));
  assert.deepEqual(fromJsonl(toJsonl(accepted)), accepted);
  assert.throws(() => fromJsonl(toJsonl(accepted) + '\n{"kind":"node.crea'),
    /line \d+ is not valid JSON/);
});

// ---------------------------------------------------------------------------
// Exit criterion 4 — restore works from the log with the snapshot discarded
// ---------------------------------------------------------------------------

test('restore from the log alone equals snapshot+tail', async () => {
  for (const seed of SEEDS.slice(0, 5)) {
    const { accepted } = admitAll(gen(seed));
    const store = new MemoryLogStore();
    await store.append(accepted);
    await writeSnapshot(store, '2026-01-02T00:00:00.000Z');

    const viaSnapshot = serialiseState(await loadState(store));
    const viaLogOnly = serialiseState(await restoreFromLogAlone(store));
    assert.deepEqual(viaLogOnly, viaSnapshot, `seed ${seed}: the snapshot disagrees with the log`);
  }
});

test('a snapshot taken mid-log still yields the same state once the tail folds', async () => {
  const { accepted } = admitAll(gen(21));
  const sorted = [...accepted].sort(compareEvents);
  const mid = Math.floor(sorted.length / 2);

  const store = new MemoryLogStore();
  await store.append(sorted.slice(0, mid));
  await writeSnapshot(store, '2026-01-01T12:00:00.000Z');   // snapshot covers only the first half
  await store.append(sorted.slice(mid));

  assert.deepEqual(
    serialiseState(await loadState(store)),
    serialiseState(await restoreFromLogAlone(store)),
    'snapshot + tail diverged from a full replay');
});

test('the log is append-only — a duplicate id is refused', async () => {
  const store = new MemoryLogStore();
  const { accepted } = admitAll(gen(4, 30));
  await store.append(accepted);
  await assert.rejects(() => store.append([accepted[0]!]), /append-only/);
});
