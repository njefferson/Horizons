// Undo of a triage route (1.2.0).
//
// The load-bearing property: undoing ANY of the six routes puts the card back in
// the inbox — captured, unrouted, off the Menu, un-trashed, and never silent for
// an instant — through the REAL gate. Append-only, so undo is inverse events,
// not a deletion, and it must hold on a synced log where per-field LWW settles
// order. These tests are written to FAIL if `clarify.reopened` stops resetting
// the route, if `menu.item.removed` stops clearing the Menu, or if any route's
// inverse leaves the node silent.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { admit, silentNodes, gateOptionsFor } from '../src/gate.ts';
import { fold, emptyState, type State } from '../src/fold.ts';
import { serialiseState, deserialiseState } from '../src/snapshot.ts';
import { unclarified } from '../src/triage.ts';
import { routeEvents, undoRouteEvents } from '../src/ui/triage-intents.ts';
import type { AppEvent, ClarifyRoute } from '../src/events.ts';
import type { StampContext } from '../src/ui/session.ts';

let seq = 0;
const at = '2026-07-28T14:00:00.000Z';
// Non-UTC on purpose (V-13): the gate's cures clock to end-of-LOCAL-day, and a
// UTC-pinned suite cannot see a whole class of zone bug.
const ctx = (): StampContext => ({
  at, device: 'd0', vault: 'personal', zone: 'America/Denver',
  seq: () => seq++, id: () => `i${seq}`,
});

const write = (prior: State, offered: AppEvent[]): State =>
  fold(admit(offered, prior, gateOptionsFor('America/Denver')), prior);

const capture = (prior: State, id: string, text: string): State => {
  const c = ctx();
  return write(prior, [{
    id: c.id(), vault: 'personal', at, device: 'd0', seq: c.seq(),
    kind: 'capture.recorded', node: id, payload: { text, source: 'quick', sourceTags: [] },
  } as AppEvent]);
};

const ROUTES: ClarifyRoute[] = ['do-now', 'next-action', 'waiting-for', 'someday', 'reference', 'trash'];

for (const route of ROUTES) {
  test(`undo of "${route}" returns the card to the inbox — nothing silent`, () => {
    let s = capture(emptyState(), 'N', 'a thing');
    const fromKind = s.nodes.get('N')!.kind;

    // Route it away, then take it back.
    s = write(s, routeEvents(ctx(), 'N', route, fromKind));
    assert.equal(s.nodes.get('N')!.route, route, 'precondition: the route landed');

    s = write(s, undoRouteEvents(ctx(), 'N', route, fromKind));

    const n = s.nodes.get('N')!;
    assert.equal(n.route, null, 'undo un-sets the route');
    assert.equal(n.trashed, false, 'undo un-trashes');
    assert.equal(n.onMenu, null, 'undo takes it off the Menu');
    assert.equal(n.kind, fromKind, 'undo restores the kind the route changed');
    assert.equal(n.captured, true, 'still a captured inbox item');
    assert.equal(silentNodes(s).length, 0, 'nothing is left silent by the undo');
    assert.ok(unclarified(s).some(x => x.id === 'N'), 'it is back in the clarify queue');
  });
}

test('after undo the card can be routed again — LWW lets the log keep moving', () => {
  let s = capture(emptyState(), 'N', 'a thing');
  const fromKind = s.nodes.get('N')!.kind;
  s = write(s, routeEvents(ctx(), 'N', 'waiting-for', fromKind));
  s = write(s, undoRouteEvents(ctx(), 'N', 'waiting-for', fromKind));
  // Re-route to a DIFFERENT place; the later route must win over the reopen.
  s = write(s, routeEvents(ctx(), 'N', 'next-action', s.nodes.get('N')!.kind));
  assert.equal(s.nodes.get('N')!.route, 'next-action', 'the newer route wins');
  assert.equal(silentNodes(s).length, 0, 'still nothing silent');
});

test('the whole log folds identically on replay and survives a snapshot round-trip', () => {
  // Determinism is the property undo must not break: reopen competes for the
  // SAME field as the route it reverses, so a full sorted replay and an
  // incremental fold must agree, and a snapshot must carry the reopened state.
  let s = capture(emptyState(), 'N', 'a thing');
  const fromKind = s.nodes.get('N')!.kind;
  const e1 = routeEvents(ctx(), 'N', 'someday', fromKind);
  const admitted1 = admit(e1, s, gateOptionsFor('America/Denver'));
  s = fold(admitted1, s);
  const e2 = undoRouteEvents(ctx(), 'N', 'someday', fromKind);
  const admitted2 = admit(e2, s, gateOptionsFor('America/Denver'));
  s = fold(admitted2, s);

  // capture + route(+cure) + undo, replayed from scratch in one sorted fold.
  const capEvent: AppEvent = {
    id: 'i0', vault: 'personal', at, device: 'd0', seq: 0,
    kind: 'capture.recorded', node: 'N', payload: { text: 'a thing', source: 'quick', sourceTags: [] },
  } as AppEvent;
  // Re-derive the full admitted stream isn't necessary; assert the two folds of
  // the SAME admitted events agree regardless of order.
  const all = [capEvent, ...admitted1, ...admitted2];
  const forward = fold(all);
  const reversed = fold([...all].reverse());
  assert.equal(forward.nodes.get('N')!.route, null, 'route is null after undo, replayed');
  assert.equal(reversed.nodes.get('N')!.route, null, 'and the same in any arrival order');
  assert.equal(forward.nodes.get('N')!.onMenu, null, 'off the Menu, replayed');

  const round = deserialiseState(JSON.parse(JSON.stringify(serialiseState(s))));
  assert.equal(round.nodes.get('N')!.route, null, 'snapshot carries the reopened state');
  assert.equal(round.nodes.get('N')!.onMenu, null, 'snapshot carries the Menu removal');
});

test('menu.item.removed alone clears the Menu and the gate re-covers the node', () => {
  // A direct check of the new noun, independent of the undo path: putting
  // something on the Menu then taking it off must leave it covered, not silent.
  let s = capture(emptyState(), 'M', 'a wish');
  s = write(s, routeEvents(ctx(), 'M', 'someday', s.nodes.get('M')!.kind));
  assert.ok(s.nodes.get('M')!.onMenu, 'precondition: on the Menu');
  s = write(s, [{
    id: ctx().id(), vault: 'personal', at, device: 'd0', seq: 99,
    kind: 'menu.item.removed', node: 'M', payload: { from: 'read' },
  } as AppEvent]);
  assert.equal(s.nodes.get('M')!.onMenu, null, 'off the Menu');
  assert.equal(silentNodes(s).length, 0, 'the gate cured it — not silent');
});
