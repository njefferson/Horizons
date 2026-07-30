// Taking in another device's shard — the road sync and the import button share.
//
// This file exists because the sync driver first did it the OTHER way, re-running
// the gate over everything that arrived. That read as the careful choice and it
// was wrong. The point of these tests is that the reasons are now executable
// rather than remembered: each one first asserts that re-admitting really does
// break, in the specific way claimed, and only then that `takeInEvents` does not.
//
// The first draft of this file got the reasons WRONG — it claimed the gate
// refuses a `node.created` naming an absent parent, and it does not; it cures it.
// Every failure asserted below was checked against the gate before it was
// written down, which is the only reason to trust the argument they support.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MemoryLogStore } from '../src/log-store.ts';
import { takeInEvents } from '../src/portability.ts';
import { admit, GateRejection } from '../src/gate.ts';
import { emptyState, fold } from '../src/fold.ts';
import type { AppEvent } from '../src/events.ts';

const NOW = '2026-07-30T12:00:00.000Z';

const at = (kind: string, id: string, node: string, seq: number, payload: Record<string, unknown>): AppEvent =>
  ({ id, vault: 'personal', at: NOW, device: 'far', seq, kind, node, payload } as AppEvent);

/** A capture and the cure the gate wrote in the same transaction, stamped as
 *  `cureFor` really stamps them: the cure carries its CAUSE's id, device and
 *  seq. This is the shape of every capture in the app. */
const curedCapture = (seq: number): [AppEvent, AppEvent] => {
  const node = `n${seq}`;
  return [
    at('capture.recorded', `far-${seq}`, node, seq, { text: 'milk', source: 'quick' }),
    at('clock.set', `far-${seq}~cure~${node}`, node, seq,
      { clockKind: 'review', at: NOW, source: 'gate:capture.recorded' }),
  ];
};

test('re-admitting an already-cured log mints a duplicate the store refuses', async () => {
  const shard = curedCapture(0);

  // The gate does not REJECT this — it silently writes a second cure carrying
  // the same derived id as the one already in the shard, which is worse than a
  // rejection because nothing complains until the write.
  const readmitted = admit(shard, emptyState());
  const ids = readmitted.map(e => e.id);
  assert.equal(ids.length, 3, 'the gate added a cure for a node that already had one');
  assert.notEqual(ids.length, new Set(ids).size, 'and its id collides with the shard\'s own cure');

  await assert.rejects(() => new MemoryLogStore().append(readmitted), /duplicate event id/,
    'so the append fails — this is what re-admitting on the sync path would do');

  // The union takes the same shard without complaint.
  const store = new MemoryLogStore();
  const out = await takeInEvents(store, shard, NOW);
  assert.equal(out.taken, 2, 'both the capture and its clock landed');

  // And law 1 holds — not because it was re-checked, but because the shard
  // already satisfied it. That is the whole argument for the union.
  const state = fold(await store.all());
  assert.equal(Object.keys(state.nodes.get('n0')!.clocks).length, 1,
    'the node arrived with what keeps it from being silent');
});

test('a second delivery of the same chunk is refused by the gate and absorbed by the union', async () => {
  // The ordinary case for anyone actually using two devices: a chunk seen again
  // after a mark was lost. The gate treats the creation as landing on a node
  // that already exists, which is exactly right for a keystroke and exactly
  // wrong for history.
  const shard = curedCapture(0);
  assert.throws(() => admit(shard, fold(shard)), GateRejection,
    'the gate refuses history it has already seen');

  const store = new MemoryLogStore();
  await takeInEvents(store, shard, NOW);
  const again = await takeInEvents(store, shard, NOW);

  assert.equal(again.taken, 0);
  assert.equal(again.skipped, 2);
  assert.equal((await store.all()).length, 2, 'nothing was duplicated and nothing threw');
});

test('events whose subject is still in flight are kept, not refused', async () => {
  // Chunks are bounded, so a subtree is split across them and there is no
  // ordering that avoids this in general. All three of these are legal history
  // that the gate refuses when the other half has not arrived.
  const orphans: [string, AppEvent][] = [
    ['a parenting', at('node.parented', 'far-5', 'n0', 5, { parent: 'not-here-yet' })],
    ['a dependency', at('dependency.declared', 'far-6', 'n0', 6, { feeds: 'not-here-yet' })],
    ['a rename', at('node.renamed', 'far-7', 'not-here-yet', 7, { title: 'renamed later' })],
  ];
  const [cause, cure] = curedCapture(0);

  for (const [what, event] of orphans) {
    assert.throws(() => admit([cause, cure, event], emptyState()), GateRejection,
      `the gate refuses ${what} whose subject it cannot see`);
  }

  const store = new MemoryLogStore();
  const out = await takeInEvents(store, [cause, cure, ...orphans.map(([, e]) => e)], NOW);
  assert.equal(out.taken, 5, 'all of it was kept');

  // And when the other half arrives, the fold resolves it — no retry, no buffer,
  // no bookkeeping. This is why the union needs none of the machinery that
  // re-admitting would have required. The missing node is written at a LOWER seq
  // than the rename, because that is the order it really happened in on the
  // device that wrote it; last-writer-wins is over `(at, device, seq)` and would
  // otherwise, correctly, keep the older title.
  await takeInEvents(store, [
    at('node.created', 'far-1', 'not-here-yet', 1, { nodeKind: 'project', title: 'named on arrival' }),
    at('clock.set', 'far-1~cure~not-here-yet', 'not-here-yet', 1,
      { clockKind: 'review', at: NOW, source: 'gate:node.created' }),
  ], NOW);

  const state = fold(await store.all());
  assert.equal(state.nodes.get('n0')!.parent, 'not-here-yet', 'the parenting took effect once its target existed');
  assert.equal(state.nodes.get('not-here-yet')!.title, 'renamed later', 'and so did the rename');
});

test('identity is the event id, so a cure is not mistaken for its cause', async () => {
  // `device#seq` is shared by a cause and its cure, so it cannot be an identity.
  // A store holding only the cause — the half-finished transfer — must still
  // accept the cure, or it keeps a node with no clock forever.
  const [cause, cure] = curedCapture(0);
  assert.equal(cause.seq, cure.seq, 'the fixture is the shape being defended against');
  assert.equal(cause.device, cure.device);

  const store = new MemoryLogStore();
  await store.append([cause]);
  const out = await takeInEvents(store, [cause, cure], NOW);

  assert.equal(out.taken, 1, 'the cure landed');
  assert.equal(out.skipped, 1, 'and the cause was recognised as already held');
  assert.ok((await store.all()).some(e => e.id === cure.id));
});
