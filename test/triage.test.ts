// Phase 2: the heat pass and the six clarify routes.
//
// The load-bearing property: EVERY route leaves the node non-silent, through the
// real gate. The two safety-net tests below state the HONEST mechanism (ADR-0029):
// a captured node is covered from capture onward, so a bare route needs no cure at
// all; and when the capture clock is also stripped, it is clock.cleared's cure —
// named by source — that holds, not clarify.routed's (which is unreachable).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { admit, silentNodes } from '../src/gate.ts';
import { fold, emptyState, type State } from '../src/fold.ts';
import { serialiseState, deserialiseState } from '../src/snapshot.ts';
import { unclarified, needsHeat, nextToClarify, inboxGauge } from '../src/triage.ts';
import { routeEvents, heatEvents } from '../src/ui/triage-intents.ts';
import type { AppEvent, ClarifyRoute } from '../src/events.ts';
import type { StampContext } from '../src/ui/session.ts';

let seq = 0;
const at = '2026-07-28T14:00:00.000Z';
const ctx = (): StampContext => ({
  at, device: 'd0', vault: 'personal',
  seq: () => seq++, id: () => `i${seq}-${Math.floor(seq)}`,
});

const write = (prior: State, offered: AppEvent[]): State => fold(admit(offered, prior), prior);

const capture = (prior: State, id: string, text: string, tags: string[] = []): State => {
  const c = ctx();
  return write(prior, [{
    id: c.id(), vault: 'personal', at, device: 'd0', seq: c.seq(),
    kind: 'capture.recorded', node: id, payload: { text, source: 'quick', sourceTags: tags },
  } as AppEvent]);
};

const ROUTES: ClarifyRoute[] = ['do-now', 'next-action', 'waiting-for', 'someday', 'reference', 'trash'];

for (const route of ROUTES) {
  test(`clarify route "${route}" terminates legally — no silent node`, () => {
    let s = capture(emptyState(), 'N', 'a thing');
    const node = s.nodes.get('N')!;
    s = write(s, routeEvents(ctx(), 'N', route, node.kind));
    assert.equal(silentNodes(s).length, 0, `route ${route} leaves nothing silent`);
    assert.equal(s.nodes.get('N')!.route, route, 'the route is recorded on the node');
    if (route === 'trash') assert.equal(s.nodes.get('N')!.trashed, true, 'trash actually trashes');
    if (route === 'waiting-for') assert.equal(s.nodes.get('N')!.kind, 'waiting-for', 'kind changed');
    if (route === 'someday' || route === 'reference') assert.ok(s.nodes.get('N')!.onMenu, 'landed on the Menu');
  });
}

test('a route that forgot its terminal event cannot silence a node — the capture clock holds', () => {
  // The real belt is not the clarify.routed cure (which never fires — a node is
  // ALWAYS covered by the time it is routed; see the next test). It is that a
  // captured node is covered from capture onward, and clarify.routed removes no
  // coverage. So a bare route — the terminal event forgotten — leaves the node
  // exactly as clarify found it: still under its capture clock, never silent,
  // and needing NO cure at all.
  let s = capture(emptyState(), 'N', 'a thing');
  const c = ctx();
  const bareRoute: AppEvent = {
    id: c.id(), vault: 'personal', at, device: 'd0', seq: c.seq(),
    kind: 'clarify.routed', node: 'N', payload: { route: 'next-action' },
  } as AppEvent;
  const admitted = admit([bareRoute], s);
  assert.equal(admitted.filter(e => e.id.includes('~cure~')).length, 0,
    'no cure was needed — the node was already covered when it was routed');
  s = fold(admitted, s);
  assert.equal(silentNodes(s).length, 0, 'a bare route leaves nothing silent');
  assert.equal(s.nodes.get('N')!.route, 'next-action', 'and the route is still recorded');
});

test('if the capture clock is also stripped, it is clock.cleared’s cure that holds — not clarify’s', () => {
  // Strip the capture cure-clock AND route bare, in one batch. NOW the node
  // would be momentarily uncovered — and the gate catches it at the clock.cleared
  // step, whose cure re-covers it BEFORE clarify.routed is even reached. This is
  // the honest account of the floor: every silent-RISK event carries its own
  // cure, so no single event can introduce silence. The clarify.routed cure is
  // redundant defence-in-depth that the real write paths never invoke.
  let s = capture(emptyState(), 'N', 'a thing');
  const c = ctx();
  const mk = (kind: string, payload: unknown): AppEvent => ({
    id: c.id(), vault: 'personal', at, device: 'd0', seq: c.seq(), kind, node: 'N', payload,
  } as AppEvent);
  const offered = [mk('clock.cleared', { clockKind: 'review' }), mk('clarify.routed', { route: 'next-action' })];
  const admitted = admit(offered, s);
  const cures = admitted.filter(e => e.id.includes('~cure~'));
  assert.equal(cures.length, 1, 'exactly one cure fired');
  assert.equal((cures[0]!.payload as { source?: string }).source, 'gate:clock.cleared',
    'and it is clock.cleared’s cure that holds the line, not clarify.routed’s');
  s = fold(admitted, s);
  assert.equal(silentNodes(s).length, 0, 'the node is never silent, at any step');
});

test('heat pass records hot/cold and does not route', () => {
  let s = capture(emptyState(), 'N', 'a thing');
  s = write(s, heatEvents(ctx(), 'N', 'hot'));
  assert.equal(s.nodes.get('N')!.heat, 'hot', 'heat recorded');
  assert.equal(s.nodes.get('N')!.route, null, 'heat did not route');
  assert.equal(needsHeat(s).length, 0, 'and it left the heat queue');
  assert.equal(unclarified(s).length, 1, 'but is still in the clarify queue');
});

test('inbox projections: unclarified drains as items are routed; boss runs hotter', () => {
  let s = emptyState();
  s = capture(s, 'A', 'first', []);
  s = capture(s, 'B', 'second', []);
  s = capture(s, 'C', 'from the boss', ['boss']);
  // Boss item C was captured last but sorts first.
  assert.equal(nextToClarify(s)!.id, 'C', 'the boss-tagged item is clarified first');
  assert.equal(inboxGauge(s).unclarified, 3);
  s = write(s, routeEvents(ctx(), 'C', 'do-now', s.nodes.get('C')!.kind));
  assert.equal(inboxGauge(s).unclarified, 2, 'routing removes it from the inbox');
  assert.equal(nextToClarify(s)!.id, 'A', 'then oldest-first resumes');
});

test('heat and route survive a snapshot round-trip (audit: snapshots were lossy)', () => {
  let s = capture(emptyState(), 'N', 'a thing', ['boss']);
  s = write(s, heatEvents(ctx(), 'N', 'cold'));
  s = write(s, routeEvents(ctx(), 'N', 'someday', s.nodes.get('N')!.kind));
  const round = deserialiseState(JSON.parse(JSON.stringify(serialiseState(s))));
  const n = round.nodes.get('N')!;
  assert.equal(n.heat, 'cold', 'heat survived');
  assert.equal(n.route, 'someday', 'route survived');
  assert.deepEqual(n.sourceTags, ['boss'], 'sourceTags survived');
});
