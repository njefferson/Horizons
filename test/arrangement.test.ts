// Arrangements — the thing that is supposed to run without you.
//
// The property that makes this worth having is not "another kind of repeat". It
// is that an arrangement's failure mode is SILENCE: it stops, nothing happens,
// and the first signal is running out. So these tests are about the question
// being different from an upkeep's, about never inventing a rhythm nobody set,
// and about the words never turning a lapse into a reproach.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fold, type State } from '../src/fold.ts';
import { admit } from '../src/gate.ts';
import {
  arrangementCards, arrangementNodes, arrangementWords, confirmedDaysAgo,
  isArrangement, dependsOnOthers, ARRANGEMENT_FIELD, DEPENDS_FIELD,
} from '../src/arrangement.ts';
import {
  markArrangementEvents, unmarkArrangementEvents, setDependsEvents,
  clearDependsEvents, confirmArrangementEvents,
} from '../src/ui/arrangement-intents.ts';
import type { AppEvent } from '../src/events.ts';

const TZ = 'America/Denver';
const NOW = '2026-08-05T18:00:00.000Z';
const AGO = (d: number): string => new Date(Date.parse(NOW) - d * 86_400_000).toISOString();

let seq = 0;
const ev = (kind: string, node: string | null, payload: unknown, at = NOW): AppEvent =>
  ({ id: `e${seq}`, vault: 'personal', at, device: 'd0', seq: seq++, kind, node, payload } as AppEvent);
const ctxAt = (at: string) => ({
  id: () => `s${seq}`, vault: 'personal', at, device: 'd0', seq: () => seq++, zone: TZ,
});
const apply = (state: State, events: AppEvent[]): State =>
  events.length === 0 ? state : fold(admit(events, state), state);

/** An ordinary repeating thing, with a rhythm, last satisfied `daysAgo`. */
function upkeep(id: string, daysAgo: number, intervalDays = 30, comfortWindowDays = 7): State {
  return fold(admit([
    ev('node.created', id, { nodeKind: 'upkeep', title: 'a repeating thing' }, AGO(daysAgo)),
    ev('upkeep.interval.set', id, { intervalDays, comfortWindowDays }, AGO(daysAgo)),
    ev('clock.set', id, { clockKind: 'review', at: NOW, source: 't' }, AGO(daysAgo)),
    ev('done.marked', id, { at: AGO(daysAgo) }, AGO(daysAgo)),
  ], fold([])));
}

// --- it does not exist until somebody says so --------------------------------

test('nothing is an arrangement until it is marked as one', () => {
  // An app that decided which of your repeating things run themselves would be
  // guessing about your life, and guessing wrong is worse than silence here.
  const s = upkeep('u', 10);
  assert.deepEqual(arrangementNodes(s), []);
  assert.deepEqual(arrangementCards(s, NOW, TZ), []);
});

test('marking an existing upkeep is a FIELD, not a new kind (ADR-0042)', () => {
  const s = apply(upkeep('u', 10), markArrangementEvents(ctxAt(NOW), 'u'));
  const n = arrangementNodes(s)[0]!;
  assert.equal(n.kind, 'upkeep', 'it decays and completes like any other repeating thing');
  assert.equal(isArrangement(n), true);
  assert.equal(Object.hasOwn(n.fields, ARRANGEMENT_FIELD), true);
});

test('unmarking gives back an ordinary upkeep without destroying it', () => {
  // You have started doing it by hand. The thing still exists and still has a
  // rhythm — losing either would be law 3's archive by another name.
  let s = apply(upkeep('u', 10), markArrangementEvents(ctxAt(NOW), 'u'));
  s = apply(s, unmarkArrangementEvents(ctxAt(NOW), 'u'));
  assert.deepEqual(arrangementNodes(s), []);
  const n = [...s.nodes.values()].find(x => x.id === 'u')!;
  assert.equal(n.trashed, false, 'still held');
  assert.equal(n.intervalDays, 30, 'and still has its rhythm');
});

// --- the question is the difference ------------------------------------------

test('THE WHOLE POINT: it asks whether the arrangement stands, not whether you did it', () => {
  const s = apply(upkeep('u', 40), markArrangementEvents(ctxAt(NOW), 'u'));
  const card = arrangementCards(s, NOW, TZ)[0]!;
  assert.match(card.words, /still arranged/i);
  assert.doesNotMatch(card.words, /\byou\b/i, 'never about the person (law 7)');
});

test('never confirmed is a fact about a new arrangement, not a lapse', () => {
  assert.match(arrangementWords(null, false), /not confirmed yet/i);
  assert.doesNotMatch(arrangementWords(null, false), /still arranged/i,
    'nothing to re-confirm when it has never been confirmed once');
});

test('the words never reproach, at any age', () => {
  for (const d of [0, 1, 2, 30, 400]) {
    const w = arrangementWords(d, false);
    for (const bad of ['overdue', 'late', 'should have', 'you have not', "you haven't", 'failed', 'behind']) {
      assert.doesNotMatch(w, new RegExp(bad, 'i'), `"${w}" says "${bad}"`);
    }
  }
});

// --- the dependency flag changes what confirming MEANS ------------------------

test('an arrangement that depends on somebody else says confirming means asking them', () => {
  // "Check this" is useless advice when checking is not a thing you can do from
  // here, and useless advice teaches somebody to skip the surface.
  let s = apply(upkeep('u', 40), markArrangementEvents(ctxAt(NOW), 'u'));
  s = apply(s, setDependsEvents(ctxAt(NOW), 'u'));
  const card = arrangementCards(s, NOW, TZ)[0]!;
  assert.equal(card.depends, true);
  assert.match(card.words, /asking whoever runs it/i);
});

test('the dependency flag is orthogonal to the marker and clears on its own', () => {
  let s = apply(upkeep('u', 40), markArrangementEvents(ctxAt(NOW), 'u'));
  s = apply(s, setDependsEvents(ctxAt(NOW), 'u'));
  s = apply(s, clearDependsEvents(ctxAt(NOW), 'u'));
  const n = arrangementNodes(s)[0]!;
  assert.equal(dependsOnOthers(n), false);
  assert.equal(isArrangement(n), true, 'still an arrangement');
  assert.equal(n.fields[DEPENDS_FIELD]!.value, false, 'written off, not erased — the log keeps the decision');
});

// --- confirming ---------------------------------------------------------------

test('confirming is an ordinary completion, and resets the rhythm', () => {
  let s = apply(upkeep('u', 40), markArrangementEvents(ctxAt(NOW), 'u'));
  const before = arrangementCards(s, NOW, TZ)[0]!.pressure!;
  s = apply(s, confirmArrangementEvents(ctxAt(NOW), 'u', 30));
  const after = arrangementCards(s, NOW, TZ)[0]!;
  assert.equal(after.days, 0, 'confirmed today');
  assert.ok(after.pressure! < before, 'and the pressure came down');
});

test('confirming NEVER invents a cadence nobody set', () => {
  // An arrangement whose rhythm was never given is one the app should be quiet
  // about. Guessing an interval here would manufacture a demand out of nothing.
  const events = confirmArrangementEvents(ctxAt(NOW), 'u', null);
  assert.equal(events.length, 1, 'the completion only');
  assert.equal(events[0]!.kind, 'done.marked');
  assert.equal(events.some(e => e.kind === 'clock.set'), false);
});

test('and a rhythmless arrangement is left off the surface rather than shouting', () => {
  // pressureOf returns null without a valid cadence. ADR-0010: silence, never a
  // zero, and never the loudest phrase in the app by falling through.
  const s = apply(fold(admit([
    ev('node.created', 'u', { nodeKind: 'upkeep', title: 'no rhythm' }, AGO(5)),
    ev('clock.set', 'u', { clockKind: 'review', at: NOW, source: 't' }, AGO(5)),
  ], fold([]))), markArrangementEvents(ctxAt(NOW), 'u'));
  assert.equal(arrangementNodes(s).length, 1, 'it is still an arrangement');
  assert.deepEqual(arrangementCards(s, NOW, TZ), [], 'it just has nothing to say');
});

test('most-pressured first, so the one closest to silently lapsing reads first', () => {
  let s = fold([]);
  for (const [id, age] of [['a', 5], ['b', 90], ['c', 40]] as const) {
    s = fold(admit([
      ev('node.created', id, { nodeKind: 'upkeep', title: id }, AGO(age)),
      ev('upkeep.interval.set', id, { intervalDays: 30, comfortWindowDays: 7 }, AGO(age)),
      ev('clock.set', id, { clockKind: 'review', at: NOW, source: 't' }, AGO(age)),
      ev('done.marked', id, { at: AGO(age) }, AGO(age)),
    ], s), s);
    s = apply(s, markArrangementEvents(ctxAt(NOW), id));
  }
  assert.deepEqual(arrangementCards(s, NOW, TZ).map(c => c.node.id), ['b', 'c', 'a']);
});

test('days since confirmation is null when there has never been one', () => {
  const n = { lastDone: null } as never;
  assert.equal(confirmedDaysAgo(n, NOW, TZ), null);
});
