// Coming back after being away (product law 8: rest is legitimate).
//
// Law 8 calls re-entry **the primary designed path**, not an edge case, and
// NOTES.md defines v1 done as thirty consecutive working days. A bad week is not
// a risk to that gate, it is a certainty — so what the app does on the morning
// you come back decides whether the gate survives at all.
//
// The load-bearing property is what the greeting CANNOT do: show the pile. Not
// after a fortnight, not after a year, not with a thousand items waiting.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fold, type State } from '../src/fold.ts';
import { admit } from '../src/gate.ts';
import {
  reentryView, reentryWords, waitingWords, amnestyWords, absenceDays,
  LAPSE_DAYS, REENTRY_TRIAGE_CAP,
} from '../src/reentry.ts';
import { greetEvents, acceptAmnestyEvents, offerAmnestyEvents } from '../src/ui/reentry-intents.ts';
import { raisesReplanCard } from '../src/replan.ts';
import { serialiseState, deserialiseState } from '../src/snapshot.ts';
import type { AppEvent } from '../src/events.ts';

const TZ = 'America/Denver';
const NOW = '2026-07-29T18:00:00.000Z';
const AGO = (d: number): string => new Date(Date.parse(NOW) - d * 86_400_000).toISOString();

let seq = 0;
const ev = (kind: string, node: string | null, payload: unknown, at = NOW): AppEvent =>
  ({ id: `e${seq}`, vault: 'personal', at, device: 'd0', seq: seq++, kind, node, payload } as AppEvent);
const st = (...e: AppEvent[]): State => fold(e);
const ctx = { id: () => `x${seq++}`, vault: 'personal', at: NOW, device: 'd0', seq: () => seq++, zone: TZ };
const apply = (s: State, e: AppEvent[]): State => (e.length ? fold(admit(e, s), s) : s);

/** A capture made `d` days ago and never routed. */
const stale = (id: string, d: number): AppEvent[] => [
  ev('capture.recorded', id, { text: `thing ${id}`, source: 'quick', sourceTags: [] }, AGO(d)),
  ev('clock.set', id, { clockKind: 'review', at: AGO(d), source: 't' }, AGO(d)),
];
/** Something with a hard date that went by while away. */
const lapsedDate = (id: string, d: number): AppEvent[] => [
  ev('node.created', id, { nodeKind: 'action', title: `dated ${id}` }, AGO(d)),
  ev('clock.set', id, { clockKind: 'due', at: AGO(d - 1), source: 't' }, AGO(d)),
  ev('clarify.routed', id, { route: 'next-action' }, AGO(d)),
];

// --- how long away ----------------------------------------------------------

test('a weekend is not a lapse', () => {
  // Greeting somebody for two days away teaches them to dismiss the greeting,
  // and then it is not there on the morning it matters.
  const s = st(...stale('A', 2));
  const v = reentryView(s, NOW, TZ);
  assert.equal(v.absenceDays, 2);
  assert.equal(v.lapsed, false);
  assert.equal(reentryWords(v), '', 'and nothing is said at all');
});

test('a fortnight is', () => {
  const s = st(...stale('A', 14));
  const v = reentryView(s, NOW, TZ);
  assert.equal(v.lapsed, true);
  assert.match(reentryWords(v), /away a fortnight/);
  assert.match(reentryWords(v), /still here/, 'the reassurance is the content');
});

test('the threshold is the stated one, and it is a real number', () => {
  assert.equal(LAPSE_DAYS, 7);
  assert.equal(reentryView(st(...stale('A', 6)), NOW, TZ).lapsed, false);
  assert.equal(reentryView(st(...stale('A', 7)), NOW, TZ).lapsed, true);
});

test('a clock that went backwards is not an absence of minus three days', () => {
  const s = st(ev('capture.recorded', 'A', { text: 'x', source: 'quick', sourceTags: [] },
    '2026-08-05T18:00:00.000Z'));
  assert.equal(absenceDays(s, NOW, TZ), 0, 'never negative — a negative would disable this for ever');
});

test('an empty store is not somebody who has been away', () => {
  const v = reentryView(fold([]), NOW, TZ);
  assert.equal(v.absenceDays, null);
  assert.equal(v.lapsed, false);
});

test('a shard of older history does not make it look as though you were away', () => {
  // lastActivityAt is a MAXIMUM, like lastReportAt and for the same reason.
  const recent = st(...stale('A', 1));
  const withOlder = fold([...stale('OLD', 40)], recent);
  assert.equal(absenceDays(withOlder, NOW, TZ), 1, 'the newest activity still wins');
});

test('it survives the snapshot round trip', () => {
  const s = st(...stale('A', 20));
  const back = deserialiseState(serialiseState(s));
  assert.equal(back.lastActivityAt, s.lastActivityAt);
  assert.equal(reentryView(back, NOW, TZ).lapsed, true);
});

// --- THE BOUND --------------------------------------------------------------

test('THE ONE THAT MATTERS: the greeting cannot be made to show the pile', () => {
  // A thousand items, a year away. The view returns COUNTS and no items at all —
  // there is no field on it a caller could render a backlog from, however hard
  // they tried. Law 8 enforced by what the type makes impossible.
  const events: AppEvent[] = [];
  for (let i = 0; i < 300; i++) events.push(...stale(`c${i}`, 365));
  for (let i = 0; i < 40; i++) events.push(...lapsedDate(`d${i}`, 365));
  const v = reentryView(fold(events), NOW, TZ);

  assert.equal(v.waitingToTriage, 300, 'it knows the true number');
  assert.equal(v.passedDates, 40, 'and states it');
  const keys = Object.keys(v).sort();
  assert.deepEqual(keys,
    ['absenceDays', 'amnestyAvailable', 'lapsed', 'passedDates', 'waitingToTriage'],
    'and carries nothing a surface could render as a list');
  for (const val of Object.values(v)) {
    assert.equal(Array.isArray(val), false, 'no arrays: there is no pile to hand over');
  }
});

test('what is written down records the guarantee, not what happened to render', () => {
  const out = greetEvents(ctx, 400, 999);
  const shown = (out[0]!.payload as { shown: { triage: number } }).shown;
  assert.equal(shown.triage, REENTRY_TRIAGE_CAP,
    'the cap, not the number a caller passed — the log records the promise');
  assert.equal(REENTRY_TRIAGE_CAP, 3, 'and the promise is three');
});

test('the words state a fact and never apologise on your behalf', () => {
  for (const d of [7, 9, 14, 30, 200]) {
    const w = reentryWords(reentryView(st(...stale('A', d)), NOW, TZ));
    for (const bad of ['sorry', 'behind', 'catch up', 'caught up', 'backlog', 'neglect',
      'missed', 'overdue', 'finally', 'at last', 'should have']) {
      assert.doesNotMatch(w, new RegExp(bad, 'i'), `"${w}" is a fact, not a bill`);
    }
    assert.doesNotMatch(w, /!/, 'and nothing is exclaimed at somebody who has been away');
  }
});

test('what is waiting is a count, offered a few at a time', () => {
  const s = st(...stale('a', 20), ...stale('b', 20), ...lapsedDate('d1', 20));
  const w = waitingWords(reentryView(s, NOW, TZ))!;
  assert.match(w, /2 things to sort/);
  assert.match(w, /one date has gone by/);
  assert.match(w, /A few at a time\./, 'the pace is stated, and it is not "all of it"');
});

test('an empty return says nothing rather than congratulating anyone', () => {
  const s = st(ev('node.created', 'A', { nodeKind: 'action', title: 'x' }, AGO(20)),
    ev('clock.set', 'A', { clockKind: 'review', at: NOW, source: 't' }, AGO(20)));
  assert.equal(waitingWords(reentryView(s, NOW, TZ)), null);
});

// --- the amnesty ------------------------------------------------------------

test('the amnesty marks nothing done and deletes nothing', () => {
  // Its honesty IS the design. Marking things done would be a lie written into
  // an append-only log; deleting would be the loss this whole app is against.
  const s0 = st(...lapsedDate('d1', 20), ...lapsedDate('d2', 20), ...lapsedDate('d3', 20));
  assert.equal(reentryView(s0, NOW, TZ).passedDates, 3);

  const s1 = apply(s0, acceptAmnestyEvents(ctx, s0, NOW, TZ));
  for (const id of ['d1', 'd2', 'd3']) {
    const n = s1.nodes.get(id)!;
    assert.equal(n.lastDone, null, `${id} was not marked done`);
    assert.equal(n.trashed, false, `${id} was not deleted`);
    assert.notEqual(n.onMenu, null, `${id} is on the Menu, where it makes no demand`);
    assert.equal(raisesReplanCard(n, NOW, TZ), false, `${id} no longer asks`);
  }
  assert.equal(reentryView(s1, NOW, TZ).passedDates, 0);
});

test('the amnesty takes ALL of them, not a capped three', () => {
  // The cap governs what a surface may SHOW. This is a thing the user explicitly
  // asked for, and doing three of the twenty they asked about would be the app
  // deciding it knew better.
  const events: AppEvent[] = [];
  for (let i = 0; i < 12; i++) events.push(...lapsedDate(`d${i}`, 20));
  const s0 = fold(events);
  assert.equal(reentryView(s0, NOW, TZ).passedDates, 12);
  const s1 = apply(s0, acceptAmnestyEvents(ctx, s0, NOW, TZ));
  assert.equal(reentryView(s1, NOW, TZ).passedDates, 0, 'all twelve');
});

test('the amnesty is a real resolution, through the same gate as a hand-made one', () => {
  const s0 = st(...lapsedDate('d1', 20));
  const out = acceptAmnestyEvents(ctx, s0, NOW, TZ);
  assert.equal(out.some(e => e.kind === 'amnesty.accepted'), true);
  assert.equal(out.some(e => e.kind === 'replan.resolved'), true,
    'each item gets the same forward-facing resolution a person would have made');
  assert.doesNotThrow(() => admit(out, s0), 'and it passes the write gate unchanged');
});

test('the amnesty log is the same every time for the same state', () => {
  const s = st(...lapsedDate('b', 20), ...lapsedDate('a', 20), ...lapsedDate('c', 20));
  const ids = (): string[] => acceptAmnestyEvents(
    { ...ctx, id: () => 'fixed', seq: () => 0 }, s, NOW, TZ,
  ).filter(e => e.kind === 'replan.resolved').map(e => e.node!);
  assert.deepEqual(ids(), ['a', 'b', 'c'], 'total order, by id');
  assert.deepEqual(ids(), ids());
});

/** A passed `suspense` — a promise to somebody else — rather than a passed
 *  `due`. The card's own sentence names whichever went by longest ago, so this
 *  is an ordinary shape and not a contrived one. */
const lapsedSuspense = (id: string, d: number): AppEvent[] => [
  ev('node.created', id, { nodeKind: 'action', title: `owed ${id}` }, AGO(d)),
  ev('suspense.set', id, { at: AGO(d - 1) }, AGO(d)),
  ev('clarify.routed', id, { route: 'next-action' }, AGO(d)),
];

test('one awkward item does not take the whole amnesty down with it', () => {
  // THE DEFECT, reproduced against the real gate. Every item went through
  // `replanEvents` with its arguments DEFAULTED: `passedKinds` fell back to
  // ['due'] and `demandClocks` to []. So an item raised by a passed `suspense`
  // kept that clock live, and an item carrying any other demand clock reached
  // the Menu still owing somebody an answer — which the Menu belt refuses.
  //
  // Because the amnesty is ONE batch, that refusal took every clean item with
  // it. Three good and one awkward moved zero of four, on the surface whose only
  // purpose is removing twenty decisions at once, at the moment a person has the
  // least patience left for a button that does nothing.
  const s0 = st(
    ...lapsedDate('a1', 20), ...lapsedDate('a2', 20), ...lapsedDate('a3', 20),
    ...lapsedSuspense('a4', 20),
  );
  assert.equal(reentryView(s0, NOW, TZ).passedDates, 4, 'fixture: four items are asking');

  const out = acceptAmnestyEvents(ctx, s0, NOW, TZ);
  assert.doesNotThrow(() => admit(out, s0),
    'the batch must be one the gate accepts — a refusal here is four items lost, not one');
  const s1 = apply(s0, out);
  assert.equal(reentryView(s1, NOW, TZ).passedDates, 0,
    'all four moved, including the one that raised a suspense rather than a due');
  for (const id of ['a1', 'a2', 'a3', 'a4']) {
    assert.notEqual(s1.nodes.get(id)!.onMenu, null, `${id} landed on the Menu`);
    assert.equal(raisesReplanCard(s1.nodes.get(id)!, NOW, TZ), false, `${id} no longer asks`);
  }
});

test('the amnesty sheds every demand clock, not only the one that went by', () => {
  // A node with a passed `due` AND a live future `suspense` still owes somebody
  // an answer. `to-menu` has to shed both or the landing is illegal — and on the
  // Menu, by law 6, it can carry no clock at all.
  const s0 = st(
    ...lapsedDate('m1', 20),
    ev('suspense.set', 'm1', { at: '2026-09-20T12:00:00.000Z' }, AGO(20)),
  );
  assert.equal(reentryView(s0, NOW, TZ).passedDates, 1);
  const out = acceptAmnestyEvents(ctx, s0, NOW, TZ);
  assert.doesNotThrow(() => admit(out, s0));
  const n = apply(s0, out).nodes.get('m1')!;
  assert.notEqual(n.onMenu, null);
  assert.deepEqual(Object.keys(n.clocks), [],
    'a thing on the Menu carries no clock — a live suspense would be a demand it cannot hold');
});

test('nothing to forgive means nothing is offered', () => {
  const s = st(...stale('A', 20));
  const v = reentryView(s, NOW, TZ);
  assert.equal(v.passedDates, 0);
  assert.equal(v.amnestyAvailable, false, 'being away is not itself something to forgive');
  assert.equal(amnestyWords(0), '');
});

test('the offer never implies there was something to forgive', () => {
  const w = amnestyWords(9);
  assert.match(w, /nothing is deleted/);
  assert.match(w, /nothing is marked done/);
  assert.match(w, /bring any of them back/);
  for (const bad of ['forgive', 'guilt', 'don’t worry', 'do not worry', 'fault',
    'behind', 'failed', 'sorry', 'wipe the slate', 'start fresh', 'clear the decks']) {
    assert.doesNotMatch(w, new RegExp(bad, 'i'), `"${bad}" appears in the amnesty offer`);
  }
});

test('the offer is recorded even when it is not taken up', () => {
  // It is evidence the app noticed a lapse and responded, which is the half
  // worth having whether or not anything was accepted.
  const out = offerAmnestyEvents(ctx, 'passed-dates');
  assert.equal(out.length, 1);
  assert.equal(out[0]!.kind, 'amnesty.offered');
});
