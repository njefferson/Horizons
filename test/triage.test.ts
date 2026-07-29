// Phase 2: the heat pass and the six clarify routes.
//
// The load-bearing property: EVERY route leaves the node non-silent, through the
// real gate. The two safety-net tests below state the HONEST mechanism (ADR-0029):
// a captured node is covered from capture onward, so a bare route needs no cure at
// all; and when the capture clock is also stripped, it is clock.cleared's cure —
// named by source — that holds, not clarify.routed's (which is unreachable).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { admit, silentNodes, gateOptionsFor } from '../src/gate.ts';
import { fold, emptyState, type State } from '../src/fold.ts';
import { serialiseState, deserialiseState } from '../src/snapshot.ts';
import { localDayKey, calendarDaysBetween } from '../src/time.ts';
import { unclarified, needsHeat, nextToClarify, inboxGauge } from '../src/triage.ts';
import { routeEvents, heatEvents } from '../src/ui/triage-intents.ts';
import type { AppEvent, ClarifyRoute } from '../src/events.ts';
import type { StampContext } from '../src/ui/session.ts';

let seq = 0;
const at = '2026-07-28T14:00:00.000Z';
// A NON-UTC zone, deliberately: end-of-UTC-day equals end-of-local-day only in
// UTC, so a suite pinned to UTC cannot see a whole class of clock bug (V-13).
const ctx = (): StampContext => ({
  at, device: 'd0', vault: 'personal', zone: 'America/Denver',
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

// --- audit fixes -----------------------------------------------------------

const raw = (kind: string, node: string, payload: unknown): AppEvent =>
  ({ id: `raw-${seq}`, vault: 'personal', at, device: 'd0', seq: seq++, kind, node, payload } as AppEvent);

test('the inbox is captures only — a person / bother / anchor never pollutes clarify (audit)', () => {
  // Membership keyed on route===null alone counted ANY unrouted live node. The
  // `captured` latch is what actually defines an inbox item.
  const s = fold([
    raw('person.created', 'P', { name: 'Ada' }),
    raw('bother.received', 'B', { text: 'the printer again' }),
    raw('anchor.defined', 'K', { name: 'Morning' }),
    raw('capture.recorded', 'C', { text: 'a real thought', source: 'quick', sourceTags: [] }),
  ]);
  assert.deepEqual(unclarified(s).map(n => n.id), ['C'], 'only the capture is unclarified');
  assert.equal(needsHeat(s).length, 1, 'and only the capture needs heat');
  assert.equal(inboxGauge(s).unclarified, 1, 'the gauge is not inflated by non-captures');
  assert.equal(nextToClarify(s)!.id, 'C', 'the card shown is never a person');
});

test('a pre-Phase-2 snapshot upgrades without crashing, and its captures still appear (audit: data lost to updates)', () => {
  let s = capture(emptyState(), 'A', 'first');
  s = capture(s, 'B', 'second');   // two items — the single-item tests hid the crash
  // Simulate a snapshot cut BEFORE Phase 2: strip the fields it never stored.
  const legacy = JSON.parse(JSON.stringify(serialiseState(s))) as { nodes: Record<string, unknown>[] };
  for (const n of legacy.nodes) { delete n['captured']; delete n['sourceTags']; delete n['heat']; delete n['route']; }
  const restored = deserialiseState(legacy);
  // Before the fix this threw "Cannot read properties of undefined (reading 'includes')".
  assert.doesNotThrow(() => unclarified(restored), 'the clarify queue does not throw on a legacy node');
  assert.equal(unclarified(restored).length, 2, 'legacy captures are treated as captures and still show');
  assert.deepEqual(restored.nodes.get('A')!.sourceTags, [], 'sourceTags backfilled to []');
  assert.equal(restored.nodes.get('A')!.captured, true, 'captured backfilled to true for a legacy node');
});

test('sourceTags honours copy-on-write — a derived mutation cannot rewrite history (audit)', () => {
  let s1 = capture(emptyState(), 'N', 'a thing', ['boss']);
  const s2 = write(s1, heatEvents(ctx(), 'N', 'hot'));   // touches N → clones it
  const a1 = s1.nodes.get('N')!.sourceTags;
  const a2 = s2.nodes.get('N')!.sourceTags;
  assert.notEqual(a1, a2, 'the clone got its own sourceTags array, not an alias of the base');
  a2.push('__mutated__');
  assert.deepEqual(s1.nodes.get('N')!.sourceTags, ['boss'], 'the base node (history) is untouched');
});

test('a do-now routed in the evening returns THAT evening, not the next day (V-13)', () => {
  // 20:30 on 28 July in Denver — already 02:30 on the 29th in UTC. The old
  // end-of-UTC-day clock landed at 17:59 local on the 29th: a "do it now" item
  // that does not come back until the following afternoon.
  const evening = '2026-07-29T02:30:00.000Z';
  const tz = 'America/Denver';
  const c: StampContext = { at: evening, device: 'd0', vault: 'personal', zone: tz,
    seq: () => seq++, id: () => `tz${seq}` };
  let s = fold(admit([{
    id: c.id(), vault: 'personal', at: evening, device: 'd0', seq: c.seq(),
    kind: 'capture.recorded', node: 'N', payload: { text: 'a small thing', source: 'quick', sourceTags: [] },
  } as AppEvent], emptyState(), gateOptionsFor(tz)));
  s = fold(admit(routeEvents(c, 'N', 'do-now', s.nodes.get('N')!.kind), s, gateOptionsFor(tz)), s);

  const clockAt = s.nodes.get('N')!.clocks.review!.at;
  assert.equal(localDayKey(clockAt, tz), localDayKey(evening, tz),
    'the clock is in the same LOCAL day the user routed it in');
  assert.equal(calendarDaysBetween(evening, clockAt, tz), 0, 'which reads as "today"');
  // And the gate's own capture cure obeys the same zone.
  const cure = s.nodes.get('N')!.clocks.review!;
  assert.ok(cure.at <= '2026-07-29T06:00:00.000Z', 'end of the local day, not the end of the UTC day');
});

test('capture does not alias the log event payload array (audit)', () => {
  const payloadTags = ['boss'];
  const s = fold([raw('capture.recorded', 'N', { text: 'x', source: 'quick', sourceTags: payloadTags })]);
  payloadTags.push('__mutated_via_log__');   // mutate the "immutable" log event
  assert.deepEqual(s.nodes.get('N')!.sourceTags, ['boss'], 'live state did not share the log payload array');
});
