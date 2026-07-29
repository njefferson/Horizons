// Containment: what holds what (law 4, "levels push down").
//
// The parent field existed from the first fold and nothing could set one, so
// every item was flat. These tests cover the arithmetic that changes that, and
// one property that has to hold absolutely: **the parent graph never contains a
// cycle**. Everything downstream — ancestor walks, exports, the sheet's own
// picker — assumes it, and an assumption nobody checks is a belief.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fold, type State } from '../src/fold.ts';
import { admit, GateRejection } from '../src/gate.ts';
import {
  ancestors, wouldParentCycle, legalParents, childrenOf, placeWords,
  isContainer, CONTAINER_KINDS, CONTAINER_DEFAULT,
} from '../src/tree.ts';
import { stalled } from '../src/review.ts';
import { makeContainerEvents, parentEvents, unparentEvents } from '../src/ui/detail-intents.ts';
import type { AppEvent, NodeKind } from '../src/events.ts';

const NOW = '2026-07-29T18:00:00.000Z';

let seq = 0;
const ev = (kind: string, node: string | null, payload: unknown): AppEvent =>
  ({ id: `e${seq}`, vault: 'personal', at: NOW, device: 'd0', seq: seq++, kind, node, payload } as AppEvent);
const st = (...e: AppEvent[]): State => fold(e);
const mk = (id: string, kind: string, title = id, parent?: string): AppEvent =>
  ev('node.created', id, { nodeKind: kind, title, ...(parent ? { parent } : {}) });

const ctx = {
  id: () => `x${seq++}`, vault: 'personal', at: NOW, device: 'd0',
  seq: () => seq++, zone: 'America/Denver',
};

// --- cycles, which are the whole reason this module exists ------------------

test('a thing cannot be put inside itself', () => {
  const s = st(mk('P', 'project'));
  assert.equal(wouldParentCycle(s, 'P', 'P'), true);
});

test('a thing cannot be put inside something already below it', () => {
  const s = st(mk('A', 'project'), mk('B', 'project', 'B', 'A'), mk('C', 'project', 'C', 'B'));
  assert.equal(wouldParentCycle(s, 'A', 'C'), true, 'A under its own grandchild closes a loop');
  assert.equal(wouldParentCycle(s, 'C', 'A'), false, 'the other direction is just a move');
});

test('the gate REFUSES the write, so no projection ever has to survive a loop', () => {
  const s = st(mk('A', 'project'), mk('B', 'project', 'B', 'A'));
  assert.throws(
    () => admit(parentEvents(ctx, 'A', 'B') as AppEvent[], s),
    (e: unknown) => e instanceof GateRejection && /inside itself/.test((e as Error).message));
  assert.throws(
    () => admit(parentEvents(ctx, 'A', 'A') as AppEvent[], s),
    (e: unknown) => e instanceof GateRejection);
});

test('a parent that is not there, or is gone, is refused', () => {
  const s = st(mk('A', 'action'), mk('P', 'project'), ev('node.trashed', 'P', {}));
  assert.throws(() => admit(parentEvents(ctx, 'A', 'GHOST') as AppEvent[], s),
    (e: unknown) => e instanceof GateRejection && /nothing here to put it under/.test((e as Error).message));
  assert.throws(() => admit(parentEvents(ctx, 'A', 'P') as AppEvent[], s),
    (e: unknown) => e instanceof GateRejection);
});

test('an ancestor walk over an ALREADY cyclic graph terminates', () => {
  // The gate stops one being written here. A shard exchange (ADR-0035) can still
  // deliver two halves of a loop that neither device ever wrote whole, and a
  // hang is indistinguishable from a dead app with the data intact and
  // unreachable — the exact failure class an earlier audit found in the date
  // projections.
  const s = st(mk('A', 'project'), mk('B', 'project'));
  s.nodes.get('A')!.parent = 'B';
  s.nodes.get('B')!.parent = 'A';
  const seen = [...ancestors(s, 'A')].map(n => n.id);
  // It stops the moment the walk comes back round, and never reports a node as
  // its own ancestor — so the loop yields B once and ends, rather than spinning.
  assert.deepEqual(seen, ['B'], 'it stops at the repeat rather than spinning');
  assert.equal(wouldParentCycle(s, 'A', 'B'), true,
    'and a walk that could not complete never reports "no loop"');
});

// --- what may legally hold something ---------------------------------------

test('only containers are offered as parents', () => {
  const kinds: NodeKind[] = ['project', 'outcome', 'area', 'goal', 'action', 'upkeep', 'person', 'waiting-for'];
  const s = st(mk('N', 'action'), ...kinds.map((k, i) => mk(`k${i}`, k)));
  const offered = legalParents(s, s.nodes.get('N')!).map(x => x.kind);
  assert.equal(offered.length, 4, 'four container kinds, and nothing else');
  for (const k of offered) assert.equal(CONTAINER_KINDS.has(k as NodeKind), true, `${k} contains work`);
});

test('the picker never offers itself, its current parent, or a loop', () => {
  const s = st(
    mk('A', 'project'), mk('B', 'project', 'B', 'A'), mk('C', 'project', 'C', 'B'),
    mk('D', 'project'),
  );
  const ids = legalParents(s, s.nodes.get('B')!).map(x => x.id);
  assert.equal(ids.includes('B'), false, 'not itself');
  assert.equal(ids.includes('A'), false, 'not where it already is — that option does nothing');
  assert.equal(ids.includes('C'), false, 'not its own child');
  assert.deepEqual(ids, ['D'], 'which leaves the one legal answer');
});

test('a trashed container cannot hold anything', () => {
  const s = st(mk('A', 'action'), mk('P', 'project'), ev('node.trashed', 'P', {}));
  assert.deepEqual(legalParents(s, s.nodes.get('A')!), []);
});

// --- making one ------------------------------------------------------------

test('promoting a captured line makes it something that can hold work', () => {
  const before = st(ev('capture.recorded', 'C', { text: 'the quarterly report', source: 'quick', sourceTags: [] }));
  assert.equal(isContainer(before.nodes.get('C')!), false);
  assert.deepEqual(legalParents(before, before.nodes.get('C')!), [],
    'and before this existed there was nothing in the app to put anything under');

  const out = admit(makeContainerEvents(ctx, 'C', before.nodes.get('C')!.kind) as AppEvent[], before);
  const after = fold(out, before);
  assert.equal(after.nodes.get('C')!.kind, CONTAINER_DEFAULT);
  assert.equal(isContainer(after.nodes.get('C')!), true);
});

test('promoting something that is already a container writes nothing', () => {
  assert.deepEqual(makeContainerEvents(ctx, 'P', 'project'), [],
    'a no-op write is still a write, and the log is the record of what happened');
});

test('the promotion never invents an outcome', () => {
  // `outcome` is a stated RESULT. A control that picked one would be putting
  // words in someone's mouth at the moment they were trying to find them.
  assert.equal(CONTAINER_DEFAULT, 'project');
});

// --- the round trip, through the gate --------------------------------------

test('put under, then taken back out — and neither leaves it silent', () => {
  const base = st(mk('P', 'project'), ev('clock.set', 'P', { clockKind: 'review', at: NOW, source: 't' }),
    mk('A', 'action'), ev('clock.set', 'A', { clockKind: 'review', at: NOW, source: 't' }));

  const parented = fold(admit(parentEvents(ctx, 'A', 'P') as AppEvent[], base), base);
  assert.equal(parented.nodes.get('A')!.parent, 'P');
  assert.deepEqual(childrenOf(parented, 'P').map(n => n.id), ['A']);
  assert.equal(placeWords(parented, parented.nodes.get('A')!), 'Part of P.');

  const out = fold(admit(unparentEvents(ctx, 'A', 'P') as AppEvent[], parented), parented);
  assert.equal(out.nodes.get('A')!.parent, null);
  assert.deepEqual(childrenOf(out, 'P'), [], 'and the container is empty again');
  assert.equal(placeWords(out, out.nodes.get('A')!), null, 'sitting nowhere is the ordinary case');
});

test('parenting real work is what stops a container being a stall', () => {
  // The two halves meeting: Review could report a stalled project from the day
  // it shipped and there was no way in the app to un-stall one.
  const base = st(mk('P', 'project'), ev('clock.set', 'P', { clockKind: 'review', at: NOW, source: 't' }),
    mk('A', 'action'), ev('clock.set', 'A', { clockKind: 'review', at: NOW, source: 't' }));
  assert.deepEqual(stalled(base).map(x => x.node.id), ['P'], 'stalled to begin with');

  const after = fold(admit(parentEvents(ctx, 'A', 'P') as AppEvent[], base), base);
  assert.deepEqual(stalled(after), [], 'and no longer, by the app’s own control');
});

test('losing a parent says so plainly, without blame', () => {
  const s = st(mk('P', 'project'), mk('A', 'action', 'a', 'P'), ev('node.trashed', 'P', {}));
  const w = placeWords(s, s.nodes.get('A')!);
  assert.equal(w, 'Part of something that was let go.');
  for (const shame of ['overdue', 'late', 'missed', 'fail', 'error', 'invalid']) {
    assert.doesNotMatch(String(w), new RegExp(shame, 'i'), `"${w}" carries no rebuke`);
  }
});
