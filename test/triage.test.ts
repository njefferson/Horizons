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
import { heldGroups } from '../src/held.ts';
import {
  routeEvents, heatEvents, fileUnderEvents, fileUnderNewEvents, undoRouteEvents, clocksOf,
  datePlaceEvents, fileReceiptWords, placeReturnDays, demandClocksOf, restorableClocksOf,
} from '../src/ui/triage-intents.ts';
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

// --- filing: the route that answers WHERE (1.19.0) ---------------------------
//
// Reported 2026-08-04: a backlog imported to work through and file in the right
// places, but keep finding that the places were not there, yet. That's the
// problem." Every other route answers when; this one answers where, and it is
// the first route whose coverage comes from clause (d) rather than a clock of
// its own.

test('filing under a NEW place leaves nothing silent — the gate clocks the place', () => {
  // The place is born with no clock, so it is newly silent and the gate cures
  // it in the same transaction. The item then rides clause (d). If either half
  // failed, this is where it shows.
  let s = capture(emptyState(), 'N', 'a thing');
  s = write(s, fileUnderNewEvents(ctx(), 'N', 'the roof job', clocksOf(s.nodes.get('N'))));
  assert.equal(silentNodes(s).length, 0, 'neither the item nor the new place is silent');
  const item = s.nodes.get('N')!;
  assert.ok(item.parent, 'the item is in a place');
  const place = s.nodes.get(item.parent!)!;
  assert.equal(place.title, 'the roof job', 'and the place is the one that was named');
  assert.ok(Object.keys(place.clocks).length > 0,
    'the PLACE carries the clock — the item rides it (law 1(d)), so the place comes back and its contents with it');
  assert.equal(Object.keys(item.clocks).length, 0,
    'and no clock was invented for the item: filing is not scheduling');
});

test('filing under an EXISTING place records the route and the parent', () => {
  let s = capture(emptyState(), 'N', 'a thing');
  s = write(s, fileUnderNewEvents(ctx(), 'N', 'the roof job', clocksOf(s.nodes.get('N'))));
  const placeId = s.nodes.get('N')!.parent!;
  // A second item, filed into the place that now exists.
  s = capture(s, 'M', 'another thing');
  s = write(s, fileUnderEvents(ctx(), 'M', placeId, clocksOf(s.nodes.get('M'))));
  assert.equal(silentNodes(s).length, 0);
  assert.equal(s.nodes.get('M')!.parent, placeId, 'it landed in the named place');
  assert.equal(s.nodes.get('M')!.route, 'filed', 'and it has left the inbox');
});

test('UNDOING a file takes it out of the place, not just out of the route', () => {
  // The defect this pins: `undoRouteEvents` had a `default` branch emitting only
  // `clarify.reopened`, so a filed item would return to the inbox STILL SITTING
  // in the place it was just taken out of. An Undo that leaves the thing where
  // it was is a lie.
  let s = capture(emptyState(), 'N', 'a thing');
  s = write(s, fileUnderNewEvents(ctx(), 'N', 'the roof job', clocksOf(s.nodes.get('N'))));
  const placeId = s.nodes.get('N')!.parent!;
  s = capture(s, 'M', 'another thing');
  s = write(s, fileUnderEvents(ctx(), 'M', placeId, clocksOf(s.nodes.get('M'))));
  const kind = s.nodes.get('M')!.kind;
  s = write(s, undoRouteEvents(ctx(), 'M', 'filed', kind));
  assert.equal(s.nodes.get('M')!.route, null, 'back in the inbox');
  assert.equal(s.nodes.get('M')!.parent, null, 'and back OUT of the place');
  assert.equal(silentNodes(s).length, 0, 'and the gate re-covered it on the way');
});

test('filing keeps every date a person set, and sheds only the app\'s own', () => {
  // THE DEFECT, reproduced against the real gate: filing cleared EVERY clock
  // the caller passed, and the callers pass `clocksOf` — all of them. So filing
  // "renew the insurance" under a place deleted its due date AND its suspense,
  // silently, in the same commit that filed it.
  //
  // A suspense is a promise to ANOTHER PERSON. Putting the item in a folder does
  // not cancel it, and nothing anywhere would have told you it had gone.
  let s = capture(emptyState(), 'N', 'a thing');
  s = write(s, fileUnderNewEvents(ctx(), 'N', 'the roof job', clocksOf(s.nodes.get('N'))));
  const placeId = s.nodes.get('N')!.parent!;

  s = capture(s, 'D', 'renew the insurance');
  s = write(s, [raw('clarify.routed', 'D', { route: 'next-action' })]);
  s = write(s, [raw('clock.set', 'D', { clockKind: 'due', at: '2026-09-01T12:00:00.000Z', source: 'detail:due' })]);
  s = write(s, [raw('suspense.set', 'D', { at: '2026-08-25T12:00:00.000Z' })]);
  s = write(s, [raw('clock.set', 'D', { clockKind: 'start', at: '2026-08-20T12:00:00.000Z', source: 'detail:start' })]);
  const before = s.nodes.get('D')!.clocks;
  assert.ok(before['review'], 'fixture: the capture cure is on it');

  s = write(s, fileUnderEvents(ctx(), 'D', placeId, clocksOf(s.nodes.get('D'))));
  const after = s.nodes.get('D')!.clocks;
  assert.equal(after['due']?.at, '2026-09-01T12:00:00.000Z', 'the due date survived being filed');
  assert.equal(after['suspense']?.at, '2026-08-25T12:00:00.000Z',
    'and so did the promise to somebody else');
  assert.equal(after['start']?.at, '2026-08-20T12:00:00.000Z', 'and the not-before');
  assert.equal(after['review'], undefined,
    'the capture cure DID go — the place answers when now, and keeping both is filed-and-still-pestering-you');
  assert.equal(s.nodes.get('D')!.route, 'filed');
  assert.equal(silentNodes(s).length, 0);
});

test('filing under a NEW place keeps them too — the same act cannot have two answers', () => {
  // `fileUnderNewEvents` does not call `fileUnderEvents`, so a filter written in
  // only one of them would mean filing under a new place still destroyed dates
  // while filing under an existing one no longer did, decided by whether the
  // folder happened to exist yet.
  let s = capture(emptyState(), 'D', 'renew the insurance');
  s = write(s, [raw('clarify.routed', 'D', { route: 'next-action' })]);
  s = write(s, [raw('clock.set', 'D', { clockKind: 'due', at: '2026-09-01T12:00:00.000Z', source: 'detail:due' })]);
  s = write(s, fileUnderNewEvents(ctx(), 'D', 'the roof job', clocksOf(s.nodes.get('D'))));
  assert.equal(s.nodes.get('D')!.clocks['due']?.at, '2026-09-01T12:00:00.000Z',
    'the due date survived being filed into a place that did not exist yet');
  assert.equal(s.nodes.get('D')!.clocks['review'], undefined);
  assert.equal(silentNodes(s).length, 0);
});

test('undoing a route to the wishes puts the dates back', () => {
  // The Menu is demand-free by law 6, so routing there genuinely HAS to shed
  // every demand clock — that half is not negotiable. What was not acceptable is
  // that Undo left them gone: one tap sent an item to the wishes and destroyed
  // the date promised to somebody else, and the control offering to take it back
  // handed you the item without the date. An undo that returns less than it took
  // is not an undo, and in an append-only log there was no other way back.
  let s = capture(emptyState(), 'D', 'renew the insurance');
  s = write(s, [raw('clarify.routed', 'D', { route: 'next-action' })]);
  s = write(s, [raw('clock.set', 'D', { clockKind: 'due', at: '2026-09-01T12:00:00.000Z', source: 'detail:due' })]);
  s = write(s, [raw('suspense.set', 'D', { at: '2026-08-25T12:00:00.000Z' })]);

  const shed = restorableClocksOf(s.nodes.get('D'));
  assert.equal(shed.length, 2, 'fixture: two dates are about to be shed');

  s = write(s, routeEvents(ctx(), 'D', 'someday', 'action', demandClocksOf(s.nodes.get('D'))));
  assert.notEqual(s.nodes.get('D')!.onMenu, null, 'it landed on the wishes');
  assert.equal(s.nodes.get('D')!.clocks['due'], undefined, 'and the dates came off, as law 6 requires');
  assert.equal(s.nodes.get('D')!.clocks['suspense'], undefined);

  s = write(s, undoRouteEvents(ctx(), 'D', 'someday', 'action', shed));
  const back = s.nodes.get('D')!;
  assert.equal(back.onMenu, null, 'off the wishes again');
  assert.equal(back.route, null, 'back in the inbox');
  assert.equal(back.clocks['due']?.at, '2026-09-01T12:00:00.000Z', 'the due date came back');
  assert.equal(back.clocks['suspense']?.at, '2026-08-25T12:00:00.000Z',
    'and so did the promise to somebody else');
  assert.equal(back.clocks['due']?.source, 'detail:due',
    'with its own provenance — restoring it as "undo" would make the log say the app chose the date');
  assert.equal(silentNodes(s).length, 0);
});

test('a route that sheds nothing restores nothing, and the undo is unchanged', () => {
  // The restore must be inert on the ordinary path. Most items carry no demand
  // clock at all when they are routed, and an undo that invents one would be a
  // date nobody set.
  let s = capture(emptyState(), 'P', 'a plain thought');
  const shed = restorableClocksOf(s.nodes.get('P'));
  assert.deepEqual(shed, []);
  s = write(s, routeEvents(ctx(), 'P', 'someday', 'action', demandClocksOf(s.nodes.get('P'))));
  s = write(s, undoRouteEvents(ctx(), 'P', 'someday', 'action', shed));
  const n = s.nodes.get('P')!;
  assert.equal(n.onMenu, null);
  assert.deepEqual(
    Object.keys(n.clocks).filter(k => k !== 'review'), [],
    'no date was invented on the way back');
  assert.equal(silentNodes(s).length, 0);
});

test('filing refuses the two shapes that would corrupt the tree', () => {
  const c = ctx();
  assert.deepEqual(fileUnderEvents(c, 'N', 'N'), [], 'nothing may be its own place');
  assert.deepEqual(fileUnderEvents(c, 'N', ''), [], 'nor filed into nowhere');
});

// --- the filed receipt (V2 stage 1) ------------------------------------------

test('the receipt answers WHEN honestly, both branches, and never reproaches', () => {
  assert.equal(fileReceiptWords('Errands', null), 'Filed under Errands — no return date yet.');
  assert.equal(fileReceiptWords('Errands', 0), 'Filed under Errands — it comes round today.');
  assert.equal(fileReceiptWords('Errands', 1), 'Filed under Errands — it comes round tomorrow.');
  assert.equal(fileReceiptWords('Errands', 4), 'Filed under Errands — it comes round in 4 days.');
  for (const w of [fileReceiptWords('X', null), fileReceiptWords('X', 3)]) {
    for (const bad of ['overdue', 'late', 'still', "haven't", 'you should', 'behind']) {
      assert.doesNotMatch(w, new RegExp(bad, 'i'), `receipt says "${bad}"`);
    }
  }
});

test('placeReturnDays reads only HUMAN clocks — a gate cure is not a return date', () => {
  // The hollow-return finding, pinned: a place minted at file time carries only
  // a gate:node.created cure, and the receipt must not present that as a
  // return. If this test ever fails by the cure counting, the receipt has
  // started promising returns that no surface will deliver.
  let s = capture(emptyState(), 'N', 'a thing');
  s = write(s, fileUnderNewEvents(ctx(), 'N', 'Errands', clocksOf(s.nodes.get('N'))));
  const place = s.nodes.get(s.nodes.get('N')!.parent!)!;
  assert.ok(Object.keys(place.clocks).length > 0, 'fixture: the place IS clocked (the gate cured it)');
  assert.equal(placeReturnDays(place, at, 'America/Denver'), null,
    'and the cure is not a return date — the honest branch fires');
  // A clock the READER set is a return date.
  const c = ctx();
  s = write(s, [{
    id: c.id(), vault: 'personal', at, device: 'd0', seq: c.seq(),
    kind: 'clock.set', node: place.id,
    payload: { clockKind: 'review', at: '2026-07-30T23:59:59.000Z', source: 'place:return' },
  } as AppEvent]);
  const dated = s.nodes.get(place.id)!;
  assert.equal(placeReturnDays(dated, at, 'America/Denver'), 2, 'two calendar days out');
});

// --- V2 stage 3: dating a place, which closes the hollow return ---------------
//
// The defect, stated once: a place minted at file time carries only a
// `gate:node.created` cure. `isAppClock` excludes that from `soonestDemand` and
// `arrivedClock`, so the place sits in "Later" for ever holding everything
// filed into it. Nothing is lost and nothing returns — the filed backlog is
// safe and invisible, which is the exact complaint filing was built to end.
//
// The return machinery was always complete. Nothing wrote the clock.

test('THE HOLLOW RETURN: an undated place never comes round, a dated one does', () => {
  // Asserted through `heldGroups`, which is what actually puts a place in front
  // of somebody. Testing the intent alone would prove the event was built and
  // say nothing about whether anybody ever sees the place again — and that gap
  // IS the defect.
  let s = write(emptyState(), [{
    id: 'p0', vault: 'personal', at, device: 'd0', seq: seq++,
    kind: 'node.created', node: 'PLACE', payload: { nodeKind: 'project', title: 'Errands' },
  } as AppEvent]);
  const groups = (st: State): string[] => heldGroups(st, at, 'America/Denver')
    .filter(g => g.items.some(n => n.id === 'PLACE')).map(g => g.key);
  assert.deepEqual(groups(s), ['later'],
    'minted and undated, it sits in Later — held, and asking nothing, for ever');

  // Three days out, through the intent the receipt now offers.
  s = write(s, datePlaceEvents(ctx(), 'PLACE', '2026-07-31'));
  assert.deepEqual(groups(s), ['soon'], 'dated, it is coming up');

  // And on the day.
  const onTheDay = heldGroups(s, '2026-07-31T20:00:00.000Z', 'America/Denver')
    .filter(g => g.items.some(n => n.id === 'PLACE')).map(g => g.key);
  assert.deepEqual(onTheDay, ['ready'], 'and on the day it is ready — it came back');
});

test('it writes a REVIEW clock, never a due — a place is not something you finish', () => {
  // The noun matters beyond taste. `due` is a hard clock, and the only reason a
  // passed one does not raise a replan card on a place is that every container
  // sits in NO_REPLAN_CARD — an accident of kind, not a decision about places.
  const [e] = datePlaceEvents(ctx(), 'PLACE', '2026-07-31');
  assert.equal(e!.kind, 'clock.set');
  assert.equal((e!.payload as { clockKind: string }).clockKind, 'review');
  // And a HUMAN source, or `placeReturnDays` and `arrivedClock` would both go
  // on ignoring it exactly as they ignore the gate's cure.
  const src = (e!.payload as { source: string }).source;
  assert.doesNotMatch(src, /^gate:/, 'not a cure — a date somebody chose');
});

test('the receipt and the confirmation cannot describe one date two ways', () => {
  // Both read `placeReturnDays` over the same state, so there is one sentence
  // for one fact. A second copy of "when does this come round" is how a surface
  // ends up disagreeing with itself.
  let s = write(emptyState(), [{
    id: 'p1', vault: 'personal', at, device: 'd0', seq: seq++,
    kind: 'node.created', node: 'PLACE', payload: { nodeKind: 'project', title: 'Errands' },
  } as AppEvent]);
  assert.match(fileReceiptWords('Errands',
    placeReturnDays(s.nodes.get('PLACE'), at, 'America/Denver')), /no return date yet/);
  s = write(s, datePlaceEvents(ctx(), 'PLACE', '2026-07-29'));
  const after = fileReceiptWords('Errands',
    placeReturnDays(s.nodes.get('PLACE'), at, 'America/Denver'));
  assert.match(after, /comes round tomorrow/);
  assert.doesNotMatch(after, /no return date/);
});

test('a day nobody picked writes nothing at all', () => {
  for (const bad of ['', '2026-7-31', 'tomorrow', '31-07-2026']) {
    assert.deepEqual(datePlaceEvents(ctx(), 'PLACE', bad), [], `"${bad}" is not a day`);
  }
  assert.deepEqual(datePlaceEvents(ctx(), '', '2026-07-31'), [], 'nor is nowhere a place');
});
